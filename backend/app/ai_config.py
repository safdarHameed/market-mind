"""Resolve which AI + search provider to use for a user.

Order: the user's own saved settings (Settings page) -> server .env fallback.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import get_settings
from app.db import SessionLocal
from app.llm.catalog import PROVIDERS, SEARCH_LABELS
from app.models import UserAISettings
from app.secrets_store import decrypt


@dataclass(frozen=True)
class AIConfig:
    provider: str  # catalog id
    model_smart: str
    model_fast: str
    api_key: str | None
    base_url: str | None
    source: str  # "user" | "server"

    @property
    def label(self) -> str:
        return PROVIDERS[self.provider]["label"]


@dataclass(frozen=True)
class SearchConfig:
    provider: str  # tavily | brave | anthropic | gemini
    api_key: str
    model: str | None  # for Claude web search
    source: str

    @property
    def label(self) -> str:
        return SEARCH_LABELS.get(self.provider, self.provider)


def load_user_settings(user_id: str | None) -> UserAISettings | None:
    if not user_id:
        return None
    with SessionLocal() as db:
        row = db.get(UserAISettings, user_id)
        if row is not None:
            db.expunge(row)
        return row


def resolve_ai(user_id: str | None, row: UserAISettings | None = None) -> AIConfig | None:
    row = row if row is not None else load_user_settings(user_id)
    if row and row.llm_provider in PROVIDERS and row.llm_model:
        spec = PROVIDERS[row.llm_provider]
        key = decrypt(row.llm_api_key_enc)
        base = row.llm_base_url or spec["base_url"]
        if (key or row.llm_provider == "custom") and (spec["kind"] == "anthropic" or base):
            return AIConfig(row.llm_provider, row.llm_model, row.llm_model, key, base, "user")
    s = get_settings()
    if s.anthropic_api_key:
        return AIConfig("anthropic", s.llm_model_smart, s.llm_model_fast, s.anthropic_api_key, None, "server")
    return None


def resolve_builtin_search(user_id: str | None, ai: AIConfig | None = None) -> SearchConfig | None:
    """Search built into the user's own AI provider (Claude web search / Google Search via Gemini), if any."""
    ai = ai if ai is not None else resolve_ai(user_id)
    if ai and ai.api_key and ai.provider == "anthropic":
        return SearchConfig("anthropic", ai.api_key, ai.model_fast, ai.source)
    if ai and ai.api_key and ai.provider == "gemini":
        return SearchConfig("gemini", ai.api_key, ai.model_fast, ai.source)
    return None


def resolve_search(user_id: str | None, ai: AIConfig | None = None, row: UserAISettings | None = None) -> SearchConfig | None:
    row = row if row is not None else load_user_settings(user_id)
    ai = ai if ai is not None else resolve_ai(user_id, row)
    s = get_settings()
    choice = (row.search_provider if row else None) or "auto"
    user_key = decrypt(row.search_api_key_enc) if row else None

    def builtin_search() -> SearchConfig | None:
        """Search built into the AI provider: Claude web search or Google Search via Gemini."""
        own = resolve_builtin_search(user_id, ai)
        if own:
            return own
        if s.anthropic_api_key:
            return SearchConfig("anthropic", s.anthropic_api_key, s.llm_model_fast, "server")
        return None

    if choice in ("tavily", "brave"):
        if user_key:
            return SearchConfig(choice, user_key, None, "user")
        server_key = s.tavily_api_key if choice == "tavily" else s.brave_api_key
        return SearchConfig(choice, server_key, None, "server") if server_key else None
    if choice in ("builtin", "anthropic"):  # "anthropic" kept for older saved settings
        return builtin_search()

    # auto: server-level SEARCH_PROVIDER pin is respected when the user hasn't chosen
    if s.search_provider == "none":
        return None
    # Prefer search built into the user's own AI provider (no extra key needed).
    if ai and ai.source == "user" and ai.provider in ("anthropic", "gemini") and ai.api_key:
        return builtin_search()
    if s.tavily_api_key and s.search_provider in ("auto", "tavily"):
        return SearchConfig("tavily", s.tavily_api_key, None, "server")
    if s.brave_api_key and s.search_provider in ("auto", "brave"):
        return SearchConfig("brave", s.brave_api_key, None, "server")
    return builtin_search()
