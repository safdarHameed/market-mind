from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class SearchResult:
    url: str
    title: str
    snippet: str | None = None
    published: str | None = None  # raw string from the provider; parsed later, never guessed
    publisher: str | None = None
    extra: dict = field(default_factory=dict)


@dataclass
class SearchRequest:
    query: str
    max_results: int = 6
    days: int | None = None  # recency window, if the provider supports it
    country_code: str | None = None  # ISO-3166 alpha-2, if the provider supports it


class SearchProviderError(Exception):
    """Raised for provider failures with a user-safe message (never includes secrets)."""


class SearchProvider(ABC):
    name: str = "base"
    label: str = "Search provider"

    @abstractmethod
    async def search(self, req: SearchRequest) -> list[SearchResult]: ...

    async def aclose(self) -> None:  # pragma: no cover - optional
        return None
