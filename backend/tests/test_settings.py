import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.ai_config import resolve_ai, resolve_search
from app.llm.base import LLMError
from app.llm.openai_provider import OpenAICompatProvider
from app.main import app
from app.models import UserAISettings
from app.research.ai_schemas import QueryPlan


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_save_settings_encrypts_and_masks_key(client, db):
    r = client.put("/settings/ai", json={"provider": "openai", "model": "gpt-x", "api_key": "sk-secret-123456789",
                                         "search_provider": "tavily", "search_api_key": "tvly-abcdef123456"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "sk-secret-123456789" not in r.text and "tvly-abcdef123456" not in r.text
    assert body["saved"]["key_hint"] == "sk-…6789" and body["saved"]["has_search_key"]
    assert body["active"]["ai"]["source"] == "user" and body["active"]["ai"]["model"] == "gpt-x"
    assert body["active"]["search"]["provider"] == "tavily" and body["active"]["ready"]

    row = db.scalars(select(UserAISettings)).one()
    assert row.llm_api_key_enc and "sk-secret" not in row.llm_api_key_enc  # encrypted at rest

    # Keeping the key: omit api_key, change model only
    r = client.put("/settings/ai", json={"provider": "openai", "model": "gpt-y", "search_provider": "tavily"})
    assert r.json()["saved"]["has_key"] and r.json()["active"]["ai"]["model"] == "gpt-y"

    # Switching provider never reuses the old key
    r = client.put("/settings/ai", json={"provider": "groq", "model": "llama"})
    assert r.status_code == 422 and "API key" in r.json()["detail"]


def test_custom_base_url_blocks_private_addresses(client):
    r = client.put("/settings/ai", json={"provider": "custom", "model": "m", "base_url": "http://127.0.0.1:11434/v1"})
    assert r.status_code == 422 and "Private" in r.json()["detail"]


def test_config_reflects_user_settings_and_clear(client):
    assert client.get("/config").json()["research_ready"] is False
    client.put("/settings/ai", json={"provider": "anthropic", "model": "claude-x", "api_key": "sk-ant-1234567890"})
    cfg = client.get("/config").json()
    # Anthropic includes web search, so research is ready with one key
    assert cfg["llm_provider"].startswith("Anthropic") and cfg["search_provider"] == "anthropic" and cfg["research_ready"]
    client.delete("/settings/ai")
    assert client.get("/config").json()["llm_configured"] is False


def test_resolution_prefers_user_over_server(db, monkeypatch):
    from app.config import get_settings
    from app.models import User
    from app.secrets_store import encrypt

    monkeypatch.setattr(get_settings(), "anthropic_api_key", "server-key")
    u = User()
    db.add(u)
    db.flush()
    assert resolve_ai(u.id).source == "server"
    db.add(UserAISettings(user_id=u.id, llm_provider="gemini", llm_model="g-1", llm_api_key_enc=encrypt("AIza-user")))
    db.commit()
    ai = resolve_ai(u.id)
    assert ai.source == "user" and ai.provider == "gemini" and ai.api_key == "AIza-user"
    # Gemini users get Google Search through their own Gemini key (no extra search key needed)
    sc = resolve_search(u.id)
    assert sc.provider == "gemini" and sc.api_key == "AIza-user"


# ---------------- OpenAI-compatible provider ----------------

VALID = {"interpretation": "x", "geographic_note": "y",
         "queries": [{"query": f"q{i}", "purpose": "p", "angle": "problem"} for i in range(3)]}


def _completion(args: dict) -> dict:
    return {"choices": [{"finish_reason": "tool_calls", "message": {"content": None, "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": "submit_queryplan", "arguments": json.dumps(args)}}]}}]}


def _provider(handler) -> OpenAICompatProvider:
    p = OpenAICompatProvider(api_key="k", base_url="https://api.example.test/v1", model="m", label="Example")
    p.client = httpx.AsyncClient(base_url="https://api.example.test/v1/", transport=httpx.MockTransport(handler))
    return p


@pytest.mark.asyncio
async def test_openai_structured_retries_then_succeeds():
    calls = []

    def handler(req: httpx.Request):
        body = json.loads(req.content)
        calls.append(body)
        assert body["tool_choice"]["function"]["name"] == "submit_queryplan"
        return httpx.Response(200, json=_completion({"interpretation": "bad"} if len(calls) == 1 else VALID))

    out = await _provider(handler).structured(system="s", prompt="p", schema=QueryPlan)
    assert len(out.queries) == 3 and len(calls) == 2
    assert calls[1]["messages"][-1]["role"] == "tool"  # validation error fed back


@pytest.mark.asyncio
async def test_openai_errors_are_user_friendly():
    p = _provider(lambda req: httpx.Response(401, json={"error": {"message": "bad key"}}))
    with pytest.raises(LLMError, match="rejected the API key"):
        await p.structured(system="s", prompt="p", schema=QueryPlan)


def _mock_models(monkeypatch, status=200, payload=None):
    import app.routers.settings as st

    real = httpx.AsyncClient

    def handler(req: httpx.Request):
        return httpx.Response(status, json=payload or {})

    monkeypatch.setattr(st.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_models_endpoint_filters_and_keeps_order(client, monkeypatch):
    _mock_models(monkeypatch, payload={"data": [
        {"id": "claude-new", "display_name": "Claude New"},
        {"id": "claude-old", "display_name": "Claude Old"},
        {"id": "text-embedding-x"},
    ]})
    r = client.post("/settings/ai/models", json={"provider": "anthropic", "api_key": "sk-ant-test-123456"})
    assert r.status_code == 200, r.text
    assert r.json()["models"] == [{"id": "claude-new", "label": "Claude New"}, {"id": "claude-old", "label": "Claude Old"}]


def test_models_endpoint_reports_bad_key(client, monkeypatch):
    _mock_models(monkeypatch, status=401)
    r = client.post("/settings/ai/models", json={"provider": "openai", "api_key": "sk-bad-123456789"})
    assert r.status_code == 400 and "rejected" in r.json()["detail"]


def test_gemini_user_without_any_server_keys_is_research_ready(client):
    """Regression: Gemini + 'Automatic' search used to leave research 'not ready'."""
    r = client.put("/settings/ai", json={"provider": "gemini", "model": "gemini-x", "api_key": "AIza-test-1234567890"})
    assert r.status_code == 200, r.text
    active = r.json()["active"]
    assert active["ready"] and active["search"]["provider"] == "gemini"
    assert client.get("/config").json()["research_ready"] is True


def test_builtin_search_rejected_for_provider_without_it(client):
    r = client.put("/settings/ai", json={"provider": "groq", "model": "m", "api_key": "gsk_test_1234567890", "search_provider": "builtin"})
    assert r.status_code == 422 and "Tavily or Brave" in r.json()["detail"]


@pytest.mark.asyncio
async def test_gemini_search_resolves_redirects_and_drops_unresolvable():
    from app.search.base import SearchRequest
    from app.search.providers import GeminiSearchProvider

    payload = {"candidates": [{"groundingMetadata": {
        "groundingChunks": [
            {"web": {"uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA", "title": "reuters.com"}},
            {"web": {"uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB", "title": "broken.com"}},
        ],
        "groundingSupports": [{"segment": {"text": "Retailers report stock-outs."}, "groundingChunkIndices": [0]}],
    }}]}

    def api(req):
        return httpx.Response(200, json=payload)

    def redirects(req):
        if req.url.path.endswith("AAA"):
            return httpx.Response(302, headers={"location": "https://www.reuters.com/business/retail-story"})
        return httpx.Response(404)

    p = GeminiSearchProvider("AIza-test", "gemini-x")
    p._client = httpx.AsyncClient(base_url="https://generativelanguage.googleapis.com/v1beta/", transport=httpx.MockTransport(api))
    p._redirects = httpx.AsyncClient(transport=httpx.MockTransport(redirects))
    out = await p.search(SearchRequest(query="small retailers inventory"))
    assert [r.url for r in out] == ["https://www.reuters.com/business/retail-story"]  # real URL only
    assert out[0].snippet == "Retailers report stock-outs."


@pytest.mark.asyncio
async def test_openai_compat_sends_relaxed_schema():
    """Regression: Gemini returned HTTP 400 for enum + maxItems; size limits are enforced by Pydantic instead."""
    sent = {}

    def handler(req: httpx.Request):
        sent.update(json.loads(req.content))
        return httpx.Response(200, json=_completion(VALID))

    await _provider(handler).structured(system="s", prompt="p", schema=QueryPlan)
    params = json.dumps(sent["tools"][0]["function"]["parameters"])
    assert "maxItems" not in params and "minItems" not in params and '"default"' not in params
    assert '"enum"' in params  # meaningful constraints are kept


@pytest.mark.asyncio
async def test_openai_compat_retries_rate_limit_then_succeeds(monkeypatch):
    """Regression: a 429 with 'try again in Ns' used to fail the whole research run."""
    import app.llm.openai_provider as op

    waits = []

    async def fake_sleep(s):
        waits.append(s)

    monkeypatch.setattr(op.asyncio, "sleep", fake_sleep)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json={"error": {"message": "Rate limit reached. Please try again in 1.5s."}})
        if calls["n"] == 2:
            return httpx.Response(503, json={"error": {"message": "overloaded"}})
        return httpx.Response(200, json=_completion(VALID))

    out = await _provider(handler).structured(system="s", prompt="p", schema=QueryPlan)
    assert len(out.queries) == 3 and calls["n"] == 3
    assert waits[0] == 2.0  # 1.5s asked + 0.5s margin, then backoff for the 503



@pytest.mark.asyncio
async def test_own_search_key_falls_back_to_builtin_on_failure():
    """Own Tavily key is tried first; if it fails (quota), the AI's built-in search is used."""
    from app.search.base import SearchProvider, SearchProviderError, SearchRequest, SearchResult
    from app.search.providers import FallbackSearchProvider

    class Down(SearchProvider):
        name, label = "tavily", "Tavily"
        calls = 0
        async def search(self, req):
            Down.calls += 1
            raise SearchProviderError("Tavily rate limit reached.")

    class Up(SearchProvider):
        name, label = "gemini", "Google Search"
        async def search(self, req):
            return [SearchResult(url="https://example.com/a", title="A")]

    fb = FallbackSearchProvider(Down(), Up())
    assert [r.url for r in await fb.search(SearchRequest(query="q"))] == ["https://example.com/a"]
    await fb.search(SearchRequest(query="q2"))
    assert Down.calls == 1  # once a key is out of quota, it isn't retried for every query


def test_gemini_user_with_own_tavily_key_uses_it_with_builtin_backup(client):
    from app.search.providers import FallbackSearchProvider, get_search_provider

    r = client.put("/settings/ai", json={"provider": "gemini", "model": "gemini-x", "api_key": "AIza-test-1234567890",
                                         "search_provider": "tavily", "search_api_key": "tvly-test-123456"})
    assert r.status_code == 200 and r.json()["active"]["search"]["provider"] == "tavily"
    uid = client.cookies.get("sh_uid")
    p = get_search_provider(uid)
    assert isinstance(p, FallbackSearchProvider) and p.primary.name == "tavily" and p.backup.name == "gemini"
