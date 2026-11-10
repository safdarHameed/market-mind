"""Application settings, loaded from environment variables / backend/.env.

Secrets are only ever read here on the server and never returned by the API.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg://localhost:5432/signalhunter"

    # CORS / frontend
    frontend_origin: str = "http://localhost:3000"
    cookie_secure: bool = False
    # Used to encrypt user API keys. If unset, a key is generated into backend/.secret_key.
    secret_key: str | None = None
    # Allow user-configured AI base URLs on private/localhost addresses (e.g. Ollama).
    # Keep false on shared deployments to prevent SSRF via custom base URLs.
    allow_private_base_urls: bool = False

    # LLM (Anthropic)
    anthropic_api_key: str | None = None
    # "smart" model: query planning, opportunity synthesis, debate.
    llm_model_smart: str = "claude-sonnet-5-5"
    # "fast" model: high-volume extraction and clustering (cost-conscious).
    llm_model_fast: str = "claude-haiku-5-5"
    llm_timeout_seconds: float = 120.0

    # Search provider: "auto" picks the first one with credentials in the order
    # tavily -> brave -> anthropic (Claude server-side web search).
    search_provider: Literal["auto", "tavily", "brave", "anthropic", "none"] = "auto"
    tavily_api_key: str | None = None
    brave_api_key: str | None = None
    anthropic_web_search_tool: str = "web_search_20250305"

    # Research limits
    research_max_queries: int = 6
    research_results_per_query: int = 6
    research_max_sources: int = 24
    fetch_timeout_seconds: float = 10.0
    fetch_max_bytes: int = 2_000_000
    fetch_concurrency: int = 6
    respect_robots_txt: bool = True
    user_agent: str = "MarketMindResearchBot/0.1 (+https://marketmind.local/bot)"

    # Simple per-user rate limit for starting discoveries
    max_discoveries_per_hour: int = 20
    max_chat_messages_per_hour: int = 120

    @property
    def llm_configured(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
