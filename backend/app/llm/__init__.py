from typing import TYPE_CHECKING

from app.config import get_settings
from app.llm.base import LLMError, LLMNotConfiguredError, LLMProvider
from app.llm.catalog import PROVIDERS

if TYPE_CHECKING:  # avoid a circular import: app.ai_config imports app.llm.catalog
    from app.ai_config import AIConfig

_override: LLMProvider | None = None
_cache: dict["AIConfig", LLMProvider] = {}


def build_llm(cfg: "AIConfig") -> LLMProvider:
    timeout = get_settings().llm_timeout_seconds
    spec = PROVIDERS[cfg.provider]
    if spec["kind"] == "anthropic":
        from app.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(cfg.api_key or "", cfg.model_smart, cfg.model_fast, timeout)
    from app.llm.openai_provider import OpenAICompatProvider

    return OpenAICompatProvider(api_key=cfg.api_key, base_url=cfg.base_url or "", model=cfg.model_smart,
                                label=spec["label"], token_param=spec["token_param"], timeout=timeout)


def get_llm(user_id: str | None = None) -> LLMProvider:
    """Return the LLM for this user (their saved settings, else the server default)."""
    if _override is not None:
        return _override
    from app.ai_config import resolve_ai

    cfg = resolve_ai(user_id)
    if cfg is None:
        raise LLMNotConfiguredError("No AI provider is connected. Add one in Settings.")
    if cfg not in _cache:
        if len(_cache) > 64:
            _cache.clear()
        _cache[cfg] = build_llm(cfg)
    return _cache[cfg]


def llm_available(user_id: str | None = None) -> bool:
    from app.ai_config import resolve_ai

    return _override is not None or resolve_ai(user_id) is not None


def set_llm(provider: LLMProvider | None) -> None:
    """Override the provider (used by tests only)."""
    global _override
    _override = provider


__all__ = ["get_llm", "set_llm", "build_llm", "llm_available", "LLMError", "LLMNotConfiguredError", "LLMProvider"]
