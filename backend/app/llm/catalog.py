"""Supported AI providers. Model lists are fetched live from each provider, so
nothing here goes stale; `suggested` is only a fallback hint."""

from __future__ import annotations

from typing import Literal, TypedDict


class ProviderSpec(TypedDict):
    label: str
    kind: Literal["anthropic", "openai"]
    base_url: str | None
    key_url: str | None
    key_placeholder: str
    needs_base_url: bool
    suggested: list[str]
    web_search: bool  # has a built-in web search we can use as a search provider
    token_param: str  # name of the max-tokens parameter


PROVIDERS: dict[str, ProviderSpec] = {
    "anthropic": {
        "label": "Anthropic (Claude)", "kind": "anthropic", "base_url": None,
        "key_url": "https://console.anthropic.com/settings/keys", "key_placeholder": "sk-ant-…",
        "needs_base_url": False, "suggested": ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
        "web_search": True, "token_param": "max_tokens",
    },
    "openai": {
        "label": "OpenAI", "kind": "openai", "base_url": "https://api.openai.com/v1",
        "key_url": "https://platform.openai.com/api-keys", "key_placeholder": "sk-…",
        "needs_base_url": False, "suggested": ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o4-mini"],
        "web_search": False, "token_param": "max_completion_tokens",
    },
    "gemini": {
        "label": "Google Gemini", "kind": "openai", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "key_url": "https://aistudio.google.com/apikey", "key_placeholder": "AIza…",
        "needs_base_url": False, "suggested": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"], "web_search": True, "token_param": "max_tokens",
    },
    "groq": {
        "label": "Groq", "kind": "openai", "base_url": "https://api.groq.com/openai/v1",
        "key_url": "https://console.groq.com/keys", "key_placeholder": "gsk_…",
        "needs_base_url": False, "suggested": ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"], "web_search": False, "token_param": "max_tokens",
    },
    "openrouter": {
        "label": "OpenRouter", "kind": "openai", "base_url": "https://openrouter.ai/api/v1",
        "key_url": "https://openrouter.ai/keys", "key_placeholder": "sk-or-…",
        "needs_base_url": False, "suggested": ["anthropic/claude-sonnet-4.5", "openai/gpt-4.1", "google/gemini-2.5-pro", "meta-llama/llama-3.3-70b-instruct"], "web_search": False, "token_param": "max_tokens",
    },
    "custom": {
        "label": "Other (OpenAI-compatible)", "kind": "openai", "base_url": None, "key_url": None,
        "key_placeholder": "API key (if required)", "needs_base_url": True, "suggested": [],
        "web_search": False, "token_param": "max_tokens",
    },
}

SEARCH_PROVIDERS = {
    "auto": "Automatic",
    "builtin": "Built-in search from your AI provider",
    "tavily": "Tavily",
    "brave": "Brave Search",
}
# Labels for the provider that actually runs a search.
SEARCH_LABELS = {
    "anthropic": "Claude web search",
    "gemini": "Google Search (via Gemini)",
    "tavily": "Tavily",
    "brave": "Brave Search",
}


def public_catalog() -> list[dict]:
    return [
        {"id": pid, "label": p["label"], "key_url": p["key_url"], "key_placeholder": p["key_placeholder"],
         "needs_base_url": p["needs_base_url"], "suggested": p["suggested"], "web_search": p["web_search"]}
        for pid, p in PROVIDERS.items()
    ]
