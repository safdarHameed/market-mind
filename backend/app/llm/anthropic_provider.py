"""Anthropic (Claude) implementation of the LLM provider.

Structured outputs use a forced tool call whose input schema is generated from the
Pydantic model; the result is then validated by Pydantic (and an optional semantic
validator). Invalid output is retried once with the validation errors, then fails
loudly — it is never patched up into made-up data.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

import anthropic
from anthropic import AsyncAnthropic
from pydantic import ValidationError

from app.llm.base import ChatEvent, LLMError, LLMProvider, T, Tier, ToolSpec
from app.llm.jsonschema import inline_schema

log = logging.getLogger(__name__)


def _friendly(e: Exception) -> str:
    if isinstance(e, anthropic.AuthenticationError):
        return "Anthropic rejected the API key. Check it in Settings."
    if isinstance(e, anthropic.PermissionDeniedError):
        return "The AI provider denied access to the configured model."
    if isinstance(e, anthropic.NotFoundError):
        return "The selected Claude model was not found. Pick another model in Settings."
    if isinstance(e, anthropic.RateLimitError):
        return "The AI provider rate limit was reached. Please try again in a minute."
    if isinstance(e, anthropic.APITimeoutError):
        return "The AI provider timed out."
    if isinstance(e, anthropic.APIStatusError) and e.status_code >= 500:
        return "The AI provider is temporarily unavailable."
    return f"AI request failed ({type(e).__name__})."


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model_smart: str, model_fast: str, timeout: float = 120.0) -> None:
        self.model_smart, self.model_fast = model_smart, model_fast
        self.client = AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=2)

    def model_for(self, tier: Tier) -> str:
        return self.model_fast if tier == "fast" else self.model_smart

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
        tool_name = "submit_" + schema.__name__.lower()
        tool = {
            "name": tool_name,
            "description": f"Submit the {schema.__name__} result. This is the only way to respond.",
            "input_schema": inline_schema(schema),
        }
        messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
        last_error = ""
        for attempt in range(2):
            try:
                resp = await self.client.messages.create(
                    model=self.model_for(tier),
                    max_tokens=max_tokens,
                    system=system,
                    messages=messages,
                    tools=[tool],
                    tool_choice={"type": "tool", "name": tool_name},
                )
            except anthropic.APIError as e:
                raise LLMError(_friendly(e)) from e

            block = next((b for b in resp.content if b.type == "tool_use"), None)
            if block is None:
                last_error = "No structured output returned."
            elif resp.stop_reason == "max_tokens":
                last_error = "Output was cut off (too long). Be more concise."
            else:
                try:
                    result = schema.model_validate(block.input)
                    problems = validator(result) if validator else []
                    if not problems:
                        return result
                    last_error = "Semantic validation failed:\n- " + "\n- ".join(problems[:15])
                except ValidationError as ve:
                    last_error = "Schema validation failed:\n" + str(ve)[:3000]

            log.warning("Structured output invalid (attempt %s): %s", attempt + 1, last_error[:300])
            if block is not None:
                messages = messages + [
                    {"role": "assistant", "content": [block.model_dump()]},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "is_error": True,
                                "content": f"{last_error}\nFix these problems and call {tool_name} again. "
                                "Only use ids that were provided; remove anything you cannot support.",
                            }
                        ],
                    },
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
        tool_defs = [{"name": t.name, "description": t.description, "input_schema": t.input_schema} for t in tools]
        handlers = {t.name: t for t in tools}
        convo = list(messages)
        for round_ in range(max_tool_rounds + 1):
            kwargs: dict[str, Any] = dict(
                model=self.model_for(tier), max_tokens=max_tokens, system=system, messages=convo
            )
            # On the final round, withhold tools so the model must answer.
            if tool_defs and round_ < max_tool_rounds:
                kwargs["tools"] = tool_defs
            try:
                async with self.client.messages.stream(**kwargs) as stream:
                    async for text in stream.text_stream:
                        yield ChatEvent(type="text", text=text)
                    final = await stream.get_final_message()
            except anthropic.APIError as e:
                raise LLMError(_friendly(e)) from e

            tool_uses = [b for b in final.content if b.type == "tool_use"]
            if final.stop_reason != "tool_use" or not tool_uses:
                return
            convo.append({"role": "assistant", "content": [b.model_dump() for b in final.content]})
            results = []
            for tu in tool_uses:
                spec = handlers.get(tu.name)
                yield ChatEvent(type="tool_start", data={"name": tu.name, "input": tu.input})
                if spec is None:
                    out, is_error = f"Unknown tool {tu.name}", True
                else:
                    try:
                        out, is_error = await spec.handler(dict(tu.input)), False
                    except Exception as e:  # tool errors are reported to the model, not swallowed
                        log.exception("Tool %s failed", tu.name)
                        out, is_error = f"Tool failed: {e}", True
                yield ChatEvent(type="tool_end", data={"name": tu.name, "is_error": is_error})
                results.append({"type": "tool_result", "tool_use_id": tu.id, "content": out, "is_error": is_error})
            convo.append({"role": "user", "content": results})


def dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)
