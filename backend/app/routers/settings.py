"""AI provider settings: choose provider, store API key (encrypted), pick a model."""

from __future__ import annotations

from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai_config import AIConfig, resolve_ai, resolve_search
from app.config import get_settings
from app.db import get_db
from app.deps import current_user
from app.llm import LLMError, build_llm
from app.llm.catalog import PROVIDERS, SEARCH_PROVIDERS, public_catalog
from app.models import User, UserAISettings
from app.research.fetcher import UnsafeURLError, assert_safe_url
from app.secrets_store import decrypt, encrypt, key_hint

router = APIRouter(prefix="/settings/ai", tags=["settings"])

ProviderId = Literal["anthropic", "openai", "gemini", "groq", "openrouter", "custom"]


class AISettingsIn(BaseModel):
    provider: ProviderId
    model: str = Field(min_length=1, max_length=200)
    api_key: str | None = Field(default=None, max_length=500, description="Omit to keep the saved key")
    base_url: str | None = Field(default=None, max_length=500)
    search_provider: Literal["auto", "builtin", "tavily", "brave", "anthropic"] = "auto"
    search_api_key: str | None = Field(default=None, max_length=500, description="Omit to keep the saved key")


class ModelsIn(BaseModel):
    provider: ProviderId
    api_key: str | None = Field(default=None, max_length=500)
    base_url: str | None = Field(default=None, max_length=500)


async def _check_base_url(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(422, "Base URL must start with http:// or https://")
    if not get_settings().allow_private_base_urls:
        try:
            await assert_safe_url(url)
        except UnsafeURLError:
            raise HTTPException(422, "Private or local addresses aren't allowed here. "
                                     "Set ALLOW_PRIVATE_BASE_URLS=true on the server to use a local model.")
    return url


def _status(user_id: str, row: UserAISettings | None) -> dict:
    ai = resolve_ai(user_id, row)
    search = resolve_search(user_id, ai, row)
    saved_key = decrypt(row.llm_api_key_enc) if row else None
    saved_search_key = decrypt(row.search_api_key_enc) if row else None
    return {
        "providers": public_catalog(),
        "search_providers": [{"id": k, "label": v} for k, v in SEARCH_PROVIDERS.items()],
        "saved": {
            "provider": row.llm_provider if row else None,
            "model": row.llm_model if row else None,
            "base_url": row.llm_base_url if row else None,
            "has_key": bool(saved_key),
            "key_hint": key_hint(saved_key),
            "search_provider": row.search_provider if row else "auto",
            "has_search_key": bool(saved_search_key),
            "search_key_hint": key_hint(saved_search_key),
        },
        "active": {
            "ai": {"provider": ai.provider, "label": ai.label, "model": ai.model_smart, "source": ai.source} if ai else None,
            "search": {"provider": search.provider, "label": search.label, "source": search.source} if search else None,
            "ready": bool(ai and search),
        },
    }


@router.get("")
def get_ai_settings(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return _status(user.id, db.get(UserAISettings, user.id))


@router.put("")
async def save_ai_settings(body: AISettingsIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    spec = PROVIDERS[body.provider]
    base_url = await _check_base_url(body.base_url) if spec["needs_base_url"] else None
    if spec["needs_base_url"] and not base_url:
        raise HTTPException(422, "Enter the base URL of your OpenAI-compatible server.")
    row = db.get(UserAISettings, user.id) or UserAISettings(user_id=user.id)
    switching = row.llm_provider != body.provider
    row.llm_provider, row.llm_model, row.llm_base_url = body.provider, body.model.strip(), base_url
    if body.api_key is not None:
        row.llm_api_key_enc = encrypt(body.api_key.strip()) if body.api_key.strip() else None
    elif switching:
        row.llm_api_key_enc = None  # never reuse one provider's key for another
    if not row.llm_api_key_enc and body.provider != "custom":
        raise HTTPException(422, f"Enter your {spec['label']} API key.")
    if body.search_provider == "anthropic":
        body.search_provider = "builtin"
    if body.search_provider == "builtin" and not spec["web_search"] and not get_settings().anthropic_api_key:
        raise HTTPException(422, f"{spec['label']} has no built-in web search. Choose Tavily or Brave instead.")
    if body.search_provider in ("tavily", "brave") and body.search_api_key is not None:
        row.search_api_key_enc = encrypt(body.search_api_key.strip()) if body.search_api_key.strip() else None
    elif body.search_provider != row.search_provider and body.search_provider not in ("tavily", "brave"):
        row.search_api_key_enc = None
    row.search_provider = body.search_provider
    db.add(row)
    db.commit()
    return _status(user.id, row)


@router.delete("")
def clear_ai_settings(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(UserAISettings, user.id)
    if row:
        db.delete(row)
        db.commit()
    return _status(user.id, None)


# Model families that can't do chat + tool calling (embeddings, audio, images, moderation…).
_NON_CHAT = ("embed", "whisper", "tts", "dall-e", "moderation", "audio", "realtime", "image", "imagen",
             "transcribe", "veo", "aqa", "guard", "search", "babbage", "davinci", "computer-use", "codex-mini")


def _label(model_id: str, display: str | None = None) -> str:
    return display or model_id


@router.post("/models")
async def list_models(body: ModelsIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Fetch the models this key can use, straight from the provider (typed key, or the saved one)."""
    spec = PROVIDERS[body.provider]
    row = db.get(UserAISettings, user.id)
    key = (body.api_key or "").strip() or (decrypt(row.llm_api_key_enc) if row and row.llm_provider == body.provider else None)
    if not key and body.provider != "custom":
        raise HTTPException(422, "Enter an API key first.")
    base = await _check_base_url(body.base_url) if spec["needs_base_url"] else spec["base_url"]
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if spec["kind"] == "anthropic":
                r = await client.get("https://api.anthropic.com/v1/models", params={"limit": 100},
                                     headers={"x-api-key": key or "", "anthropic-version": "2023-06-01"})
            else:
                if not base:
                    raise HTTPException(422, "Enter the base URL first.")
                r = await client.get(base.rstrip("/") + "/models",
                                     headers={"Authorization": f"Bearer {key}"} if key else {})
    except httpx.HTTPError:
        raise HTTPException(502, f"Couldn't reach {spec['label']}. Check the connection or base URL.")
    if r.status_code in (401, 403):
        raise HTTPException(400, f"{spec['label']} rejected this API key.")
    if r.status_code >= 400:
        raise HTTPException(502, f"{spec['label']} returned HTTP {r.status_code} when listing models.")

    raw = r.json().get("data") or []
    seen: set[str] = set()
    models: list[dict[str, str]] = []
    for m in raw:  # keep the provider's own order (Anthropic lists newest first)
        mid = str(m.get("id", "")).removeprefix("models/")
        if not mid or mid in seen or any(x in mid.lower() for x in _NON_CHAT):
            continue
        seen.add(mid)
        models.append({"id": mid, "label": _label(mid, m.get("display_name") or m.get("name"))})
    if spec["kind"] == "openai":
        models.sort(key=lambda x: x["id"])
    return {"models": models}


@router.post("/test")
async def test_connection(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Run a tiny structured call with the saved settings to prove the key + model work."""
    from app.research.ai_schemas import Audience

    cfg: AIConfig | None = resolve_ai(user.id)
    if cfg is None:
        raise HTTPException(400, "No AI provider is connected yet.")
    llm = build_llm(cfg)
    try:
        await llm.structured(system="You are a connectivity check.",
                             prompt="Return segment='test' and why='ok'.", schema=Audience, tier="fast", max_tokens=200)
    except LLMError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "provider": cfg.label, "model": cfg.model_smart, "source": cfg.source}
