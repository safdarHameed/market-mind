"""OpenAI-compatible Chat Completions provider (OpenAI, Gemini, Groq, OpenRouter, custom).

Structured output uses a forced function call validated by Pydantic, mirroring the
Anthropic provider: one retry with the validation errors, then a clear failure.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
from pydantic import ValidationError

from app.llm.base import ChatEvent, LLMError, LLMProvider, T, Tier, ToolSpec
from app.llm.jsonschema import inline_schema

log = logging.getLogger(__name__)


def _error_message(status: int, body: str, label: str) -> str:
    low = body.lower()
    if status in (401, 403):
        return f"{label} rejected the API key. Check it in Settings."
    if status == 404 or "model" in low and ("not found" in low or "does not exist" in low):
        return f"{label} couldn't find the selected model. Pick another model in Settings."
    if status == 429:
        return f"{label} rate limit or quota reached. Try again shortly or check your plan."
    if status == 400 and ("tool" in low or "function" in low):
        return f"The selected {label} model doesn't support tool calling, which MarketMind needs. Choose another model."
    if status >= 500:
        return f"{label} is temporarily unavailable."
    return f"{label} request failed (HTTP {status})."


# Some OpenAI-compatible APIs (notably Gemini) reject tool schemas whose constraints are
# "too complex" — e.g. a long enum combined with maxItems — with a bare HTTP 400. Size limits
# and defaults are still enforced by Pydantic when we validate the output, so we omit them here.
_RELAXED_KEYS = {"minItems", "maxItems", "default"}


def relax_schema(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: relax_schema(v) for k, v in node.items() if k not in _RELAXED_KEYS}
    if isinstance(node, list):
        return [relax_schema(x) for x in node]
    return node


class OpenAICompatProvider(LLMProvider):
    name = "openai"

    def __init__(self, *, api_key: str | None, base_url: str, model: str, label: str,
                 token_param: str = "max_tokens", timeout: float = 120.0) -> None:
        self.model, self.label, self.token_param = model, label, token_param
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self.client = httpx.AsyncClient(base_url=base_url.rstrip("/") + "/", headers=headers, timeout=timeout)

    def model_for(self, tier: Tier) -> str:
        return self.model

    MAX_RETRIES = 4
    MAX_WAIT_SECONDS = 60.0

    @staticmethod
    def _retry_after(r: httpx.Response, attempt: int) -> float:
        """How long the provider asked us to wait (Retry-After header or 'try again in Ns'), else backoff."""
        header = r.headers.get("retry-after")
        if header:
            try:
                return float(header)
            except ValueError:
                pass
        m = re.search(r"try again in ([0-9.]+)\s*(ms|s)", r.text, re.I)
        if m:
            secs = float(m.group(1)) / (1000 if m.group(2).lower() == "ms" else 1)
            return secs + 0.5
        return 2.0 * (2 ** attempt)  # 2s, 4s, 8s, 16s

    async def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                r = await self.client.post("chat/completions", json=body)
            except httpx.TimeoutException as e:
                if attempt < self.MAX_RETRIES:
                    continue
                raise LLMError(f"{self.label} timed out.") from e
            except httpx.HTTPError as e:
                raise LLMError(f"Couldn't reach {self.label} ({type(e).__name__}).") from e
            # Rate limits and temporary outages: wait as asked, then retry instead of failing the research.
            if (r.status_code == 429 or r.status_code >= 500) and attempt < self.MAX_RETRIES:
                wait = min(self._retry_after(r, attempt), self.MAX_WAIT_SECONDS)
                log.info("%s HTTP %s — retrying in %.1fs (attempt %s)", self.label, r.status_code, wait, attempt + 1)
                await asyncio.sleep(wait)
                continue
            if r.status_code >= 400:
                log.warning("%s HTTP %s: %s", self.label, r.status_code, r.text[:500])
                raise LLMError(_error_message(r.status_code, r.text[:500], self.label))
            return r.json()
        raise LLMError(f"{self.label} kept refusing requests. Try again in a minute.")

    async def structured(
        self,
        *,
        system: str,
        prompt: str,
        schema: type[T],
        tier: Tier = "smart",
        max_tokens: int = 8000,
        validator: Callable[[T], list[str]] | None = None,
    ) -> T:
        fn = "submit_" + schema.__name__.lower()
        tools = [{"type": "function", "function": {
            "name": fn, "description": f"Submit the {schema.__name__} result. This is the only way to respond.",
            "parameters": relax_schema(inline_schema(schema))}}]
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
        tool_choice: Any = {"type": "function", "function": {"name": fn}}
        last_error = ""
        for attempt in range(2):
            body = {"model": self.model, "messages": messages, "tools": tools, "tool_choice": tool_choice,
                    self.token_param: max_tokens}
            try:
                data = await self._post(body)
            except LLMError as e:
                # Some compatible APIs only accept tool_choice="required"; retry once that way.
                if "tool calling" in str(e) and tool_choice != "required":
                    tool_choice = "required"
                    data = await self._post(body | {"tool_choice": "required"})
                else:
                    raise
            choice = (data.get("choices") or [{}])[0]
            msg = choice.get("message") or {}
            calls = msg.get("tool_calls") or []
            call = calls[0] if calls else None
            if call is None:
                last_error = "No structured output returned."
            elif choice.get("finish_reason") == "length":
                last_error = "Output was cut off (too long). Be more concise."
            else:
                try:
                    args = json.loads(call["function"]["arguments"] or "{}")
                    result = schema.model_validate(args)
                    problems = validator(result) if validator else []
                    if not problems:
                        return result
                    last_error = "Semantic validation failed:\n- " + "\n- ".join(problems[:15])
                except json.JSONDecodeError:
                    last_error = "Arguments were not valid JSON."
                except ValidationError as ve:
                    last_error = "Schema validation failed:\n" + str(ve)[:3000]
            log.warning("Structured output invalid (attempt %s): %s", attempt + 1, last_error[:300])
            if call is not None:
                messages = messages + [
                    {"role": "assistant", "content": msg.get("content"), "tool_calls": [call]},
                    {"role": "tool", "tool_call_id": call.get("id", "call_0"),
                     "content": f"ERROR: {last_error}\nFix these problems and call {fn} again. Only use ids that were provided."},
                ]
        raise LLMError(f"The AI returned invalid structured data twice. {last_error[:200]}")

    async def chat(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[ToolSpec],
        tier: Tier = "smart",
        max_tokens: int = 2500,
        max_tool_rounds: int = 3,
    ) -> AsyncIterator[ChatEvent]:
        tool_defs = [{"type": "function", "function": {"name": t.name, "description": t.description,
                                                        "parameters": t.input_schema}} for t in tools]
        handlers = {t.name: t for t in tools}
        convo: list[dict[str, Any]] = [{"role": "system", "content": system}] + list(messages)
        for round_ in range(max_tool_rounds + 1):
            body: dict[str, Any] = {"model": self.model, "messages": convo, "stream": True, self.token_param: max_tokens}
            if tool_defs and round_ < max_tool_rounds:
                body["tools"] = tool_defs
            text_parts: list[str] = []
            calls: dict[int, dict[str, Any]] = {}
            finish = None
            try:
                async with self.client.stream("POST", "chat/completions", json=body) as r:
                    if r.status_code >= 400:
                        raise LLMError(_error_message(r.status_code, (await r.aread()).decode(errors="ignore")[:500], self.label))
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            chunk = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        for ch in chunk.get("choices") or []:
                            delta = ch.get("delta") or {}
                            if delta.get("content"):
                                text_parts.append(delta["content"])
                                yield ChatEvent(type="text", text=delta["content"])
                            for tc in delta.get("tool_calls") or []:
                                slot = calls.setdefault(tc.get("index", 0), {"id": None, "name": "", "arguments": ""})
                                slot["id"] = tc.get("id") or slot["id"]
                                fnd = tc.get("function") or {}
                                slot["name"] += fnd.get("name") or ""
                                slot["arguments"] += fnd.get("arguments") or ""
                            finish = ch.get("finish_reason") or finish
            except httpx.HTTPError as e:
                raise LLMError(f"Lost connection to {self.label} ({type(e).__name__}).") from e

            if not calls:
                return
            ordered = [calls[i] for i in sorted(calls)]
            convo.append({"role": "assistant", "content": "".join(text_parts) or None, "tool_calls": [
                {"id": c["id"] or f"call_{i}", "type": "function", "function": {"name": c["name"], "arguments": c["arguments"] or "{}"}}
                for i, c in enumerate(ordered)]})
            for i, c in enumerate(ordered):
                try:
                    args = json.loads(c["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                yield ChatEvent(type="tool_start", data={"name": c["name"], "input": args})
                spec = handlers.get(c["name"])
                if spec is None:
                    out, err = f"Unknown tool {c['name']}", True
                else:
                    try:
                        out, err = await spec.handler(args), False
                    except Exception as e:
                        log.exception("Tool %s failed", c["name"])
                        out, err = f"Tool failed: {e}", True
                yield ChatEvent(type="tool_end", data={"name": c["name"], "is_error": err})
                convo.append({"role": "tool", "tool_call_id": c["id"] or f"call_{i}", "content": out})
