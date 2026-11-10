from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)
Tier = Literal["fast", "smart"]


class LLMError(Exception):
    """User-safe LLM failure message."""


class LLMNotConfiguredError(LLMError):
    pass


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[dict[str, Any]], Awaitable[str]]


@dataclass
class ChatEvent:
    type: Literal["text", "tool_start", "tool_end"]
    text: str = ""
    data: dict[str, Any] = field(default_factory=dict)


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def model_for(self, tier: Tier) -> str: ...

    @abstractmethod
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
        """Return a validated instance of `schema`. Retries once with error feedback, then raises LLMError."""

    @abstractmethod
    def chat(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[ToolSpec],
        tier: Tier = "smart",
        max_tokens: int = 2500,
        max_tool_rounds: int = 3,
    ) -> AsyncIterator[ChatEvent]:
        """Stream a conversational turn, running tools as requested."""
