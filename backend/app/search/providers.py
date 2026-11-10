"""Concrete search providers. Each one returns only what the provider actually returned."""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import get_settings
from app.search.base import SearchProvider, SearchProviderError, SearchRequest, SearchResult

log = logging.getLogger(__name__)


def _freshness_brave(days: int | None) -> str | None:
    if not days:
        return None
    if days <= 1:
        return "pd"
    if days <= 7:
        return "pw"
    if days <= 31:
        return "pm"
    return "py"


class TavilyProvider(SearchProvider):
    name = "tavily"
    label = "Tavily Search"

    def __init__(self, api_key: str) -> None:
        self._client = httpx.AsyncClient(
            base_url="https://api.tavily.com",
            timeout=25.0,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def search(self, req: SearchRequest) -> list[SearchResult]:
        body: dict = {
            "query": req.query[:400],
            "max_results": req.max_results,
            "search_depth": "advanced",
            "include_answer": False,
            "include_raw_content": False,
        }
        if req.days:
            body["days"] = req.days
            body["topic"] = "news" if req.days <= 31 else "general"
        try:
            r = await self._client.post("/search", json=body)
        except httpx.HTTPError as e:
            raise SearchProviderError(f"Tavily request failed ({type(e).__name__}).") from e
        if r.status_code in (401, 403):
            raise SearchProviderError("Tavily rejected the API key. Check it in Settings.")
        if r.status_code == 429:
            raise SearchProviderError("Tavily rate limit reached. Try again shortly.")
        if r.status_code >= 400:
            raise SearchProviderError(f"Tavily returned HTTP {r.status_code}.")
        out = []
        for item in r.json().get("results", []):
            if item.get("url") and item.get("title"):
                out.append(
                    SearchResult(
                        url=item["url"],
                        title=item["title"],
                        snippet=item.get("content"),
                        published=item.get("published_date"),
                    )
                )
        return out

    async def aclose(self) -> None:
        await self._client.aclose()


class BraveProvider(SearchProvider):
    name = "brave"
    label = "Brave Search"

    def __init__(self, api_key: str) -> None:
        self._client = httpx.AsyncClient(
            base_url="https://api.search.brave.com/res/v1",
            timeout=20.0,
            headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
        )

    async def search(self, req: SearchRequest) -> list[SearchResult]:
        params: dict = {"q": req.query[:400], "count": min(req.max_results, 20), "text_decorations": "false"}
        if f := _freshness_brave(req.days):
            params["freshness"] = f
        if req.country_code:
            params["country"] = req.country_code.upper()
        try:
            r = await self._client.get("/web/search", params=params)
        except httpx.HTTPError as e:
            raise SearchProviderError(f"Brave request failed ({type(e).__name__}).") from e
        if r.status_code in (401, 403, 422) and "country" in params:
            params.pop("country")  # unsupported country code: retry globally rather than fail
            r = await self._client.get("/web/search", params=params)
        if r.status_code in (401, 403):
            raise SearchProviderError("Brave rejected the API key. Check it in Settings.")
        if r.status_code == 429:
            raise SearchProviderError("Brave rate limit reached. Try again shortly.")
        if r.status_code >= 400:
            raise SearchProviderError(f"Brave returned HTTP {r.status_code}.")
        out = []
        for item in (r.json().get("web") or {}).get("results", []):
            if item.get("url") and item.get("title"):
                out.append(
                    SearchResult(
                        url=item["url"],
                        title=item["title"],
                        snippet=item.get("description"),
                        published=item.get("page_age"),  # ISO timestamp when present
                        publisher=(item.get("profile") or {}).get("name"),
                    )
                )
        return out

    async def aclose(self) -> None:
        await self._client.aclose()


class AnthropicWebSearchProvider(SearchProvider):
    """Uses Claude's server-side web search tool as a plain search backend.

    We only keep the URLs/titles/page_age the tool returned; page text is fetched
    and verified independently by the fetcher.
    """

    name = "anthropic"
    label = "Claude web search"

    def __init__(self, api_key: str, model: str) -> None:
        from anthropic import AsyncAnthropic

        self._model = model
        self._client = AsyncAnthropic(api_key=api_key, timeout=60.0, max_retries=2)

    async def search(self, req: SearchRequest) -> list[SearchResult]:
        import anthropic

        tool: dict = {"type": get_settings().anthropic_web_search_tool, "name": "web_search", "max_uses": 1}
        if req.country_code:
            tool["user_location"] = {"type": "approximate", "country": req.country_code.upper()}
        try:
            resp = await self._client.messages.create(
                model=self._model,
                max_tokens=512,
                tools=[tool],
                messages=[
                    {
                        "role": "user",
                        "content": f"Run exactly one web search for this query and do not answer it: {req.query[:400]}",
                    }
                ],
            )
        except anthropic.APIStatusError as e:
            msg = "Claude web search failed"
            if e.status_code in (401, 403):
                msg = "Claude web search is not authorized. Check the Anthropic key and that web search is enabled for your organization."
            elif e.status_code == 429:
                msg = "Claude web search rate limit reached. Try again shortly."
            raise SearchProviderError(msg) from e
        except anthropic.APIError as e:
            raise SearchProviderError(f"Claude web search failed ({type(e).__name__}).") from e

        out: list[SearchResult] = []
        for block in resp.content:
            if getattr(block, "type", None) != "web_search_tool_result":
                continue
            content = getattr(block, "content", None)
            if not isinstance(content, list):
                err = getattr(content, "error_code", "unknown")
                raise SearchProviderError(f"Claude web search returned an error ({err}).")
            for item in content[: req.max_results]:
                url, title = getattr(item, "url", None), getattr(item, "title", None)
                if url and title:
                    out.append(SearchResult(url=url, title=title, published=getattr(item, "page_age", None)))
        return out

    async def aclose(self) -> None:
        await self._client.close()


class GeminiSearchProvider(SearchProvider):
    """Google Search grounding through the user's Gemini key.

    Gemini returns grounding links as Google redirect URLs; we resolve each one to the
    real article URL (without fetching the article) and drop any we can't resolve, so
    only genuine source URLs are ever stored or cited.
    """

    name = "gemini"
    label = "Google Search (via Gemini)"
    FALLBACK_MODEL = "gemini-2.5-flash"

    def __init__(self, api_key: str, model: str) -> None:
        self._model = model
        self._model_failed = False
        self._client = httpx.AsyncClient(
            base_url="https://generativelanguage.googleapis.com/v1beta/",
            timeout=40.0,
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        )
        self._redirects = httpx.AsyncClient(timeout=10.0, follow_redirects=False)

    async def _ground(self, model: str, query: str) -> httpx.Response:
        text = query if query.startswith("Use Google Search") else (
            f"Search the web for recent, relevant sources about: {query}. Briefly summarise what they say.")
        body = {
            "contents": [{"role": "user", "parts": [{"text": text}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"maxOutputTokens": 1024},
        }
        return await self._client.post(f"models/{model}:generateContent", json=body)

    async def _resolve(self, uri: str) -> str | None:
        if "grounding-api-redirect" not in uri:
            return uri
        try:
            r = await self._redirects.get(uri)
        except httpx.HTTPError:
            return None
        loc = r.headers.get("location")
        return loc if loc and loc.startswith(("http://", "https://")) else None

    async def search(self, req: SearchRequest) -> list[SearchResult]:
        try:
            # Once the chosen model has no search quota, go straight to the fallback for this run.
            first = self.FALLBACK_MODEL if self._model_failed else self._model
            r = await self._ground(first, req.query[:400])
            if r.status_code in (400, 429) and first != self.FALLBACK_MODEL:
                # Some models (or plans) don't include Google Search grounding; use one that does.
                self._model_failed = True
                r = await self._ground(self.FALLBACK_MODEL, req.query[:400])
        except httpx.HTTPError as e:
            raise SearchProviderError(f"Google Search via Gemini failed ({type(e).__name__}).") from e
        if r.status_code in (401, 403):
            raise SearchProviderError("Gemini rejected the API key for Google Search. Check it in Settings.")
        if r.status_code == 429:
            raise SearchProviderError(
                "Your Gemini key has no Google Search quota left (Google limits search on free plans). "
                "Add a free Tavily key in Settings, or enable billing for your Gemini key."
            )
        if r.status_code >= 400:
            raise SearchProviderError(f"Google Search via Gemini returned HTTP {r.status_code}.")

        cand = (r.json().get("candidates") or [{}])[0]
        meta = cand.get("groundingMetadata") or {}
        chunks = meta.get("groundingChunks") or []
        if not chunks:
            # Gemini decides itself whether to search; ask once more, explicitly.
            try:
                r2 = await self._ground(self.FALLBACK_MODEL if self._model_failed else self._model,
                                        f"Use Google Search now. Find web sources about: {req.query[:400]}")
                if r2.status_code < 400:
                    cand = (r2.json().get("candidates") or [{}])[0]
                    meta = cand.get("groundingMetadata") or {}
                    chunks = meta.get("groundingChunks") or []
            except httpx.HTTPError:
                pass
        # Text Gemini attributed to each source (used only as a search snippet; pages are fetched separately).
        snippets: dict[int, list[str]] = {}
        for sup in meta.get("groundingSupports") or []:
            text = ((sup.get("segment") or {}).get("text") or "").strip()
            for idx in sup.get("groundingChunkIndices") or []:
                if text:
                    snippets.setdefault(idx, []).append(text)

        webs = [(i, c["web"]) for i, c in enumerate(chunks) if isinstance(c.get("web"), dict) and c["web"].get("uri")]
        webs = webs[: req.max_results]
        resolved = await asyncio.gather(*(self._resolve(w["uri"]) for _, w in webs))
        out: list[SearchResult] = []
        for (i, w), url in zip(webs, resolved):
            if not url:
                continue
            out.append(SearchResult(url=url, title=(w.get("title") or "").strip() or url,
                                    snippet=" ".join(snippets.get(i, []))[:1500] or None))
        return out

    async def aclose(self) -> None:
        await self._client.aclose()
        await self._redirects.aclose()


class FallbackSearchProvider(SearchProvider):
    """Try the user's own search key first; if it fails (quota, outage), use the AI's built-in search."""

    def __init__(self, primary: SearchProvider, backup: SearchProvider) -> None:
        self.primary, self.backup = primary, backup
        self.name, self.label = primary.name, primary.label
        self._primary_down = False

    async def search(self, req: SearchRequest) -> list[SearchResult]:
        if not self._primary_down:
            try:
                return await self.primary.search(req)
            except SearchProviderError as e:
                log.warning("%s failed (%s) — using %s instead", self.primary.label, e, self.backup.label)
                self._primary_down = True  # don't keep hitting a provider that's out of quota this run
        return await self.backup.search(req)

    async def aclose(self) -> None:
        await self.primary.aclose()
        await self.backup.aclose()


def _build(cfg) -> SearchProvider:
    if cfg.provider == "tavily":
        return TavilyProvider(cfg.api_key)
    if cfg.provider == "brave":
        return BraveProvider(cfg.api_key)
    if cfg.provider == "gemini":
        return GeminiSearchProvider(cfg.api_key, cfg.model or GeminiSearchProvider.FALLBACK_MODEL)
    return AnthropicWebSearchProvider(cfg.api_key, cfg.model or get_settings().llm_model_fast)


def get_search_provider(user_id: str | None = None) -> SearchProvider | None:
    from app.ai_config import resolve_builtin_search, resolve_search

    cfg = resolve_search(user_id)
    if cfg is None:
        return None
    primary = _build(cfg)
    # User's own search key + an AI with built-in search: keep the built-in one as a backup.
    if cfg.provider in ("tavily", "brave") and cfg.source == "user":
        backup = resolve_builtin_search(user_id)
        if backup is not None:
            return FallbackSearchProvider(primary, _build(backup))
    return primary
