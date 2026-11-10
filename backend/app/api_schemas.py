"""API request validation (responses are built by app.serializers)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class LocationIn(BaseModel):
    level: Literal["global", "country", "region", "city"] = "global"
    label: str = Field(default="Global", max_length=160)
    country: str | None = Field(default=None, max_length=80)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    region: str | None = Field(default=None, max_length=80)
    city: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def consistent(self) -> "LocationIn":
        if self.level == "global":
            self.label, self.country, self.country_code, self.region, self.city = "Global", None, None, None, None
        elif not self.label.strip():
            raise ValueError("Location label is required")
        return self


class FiltersIn(BaseModel):
    time_period: Literal["7d", "30d", "3m", "6m", "1y", "any"] = "1y"
    stage: Literal["early_signal", "emerging", "growing", "established"] | None = None
    competition: Literal["low", "moderate", "high"] | None = None
    investment: Literal["low", "moderate", "high"] | None = None
    scale: Literal["individual", "small_business", "startup", "enterprise"] | None = None
    audience: Literal["consumers", "businesses", "government"] | None = None


class DiscoveryIn(BaseModel):
    location: LocationIn = LocationIn()
    industries: list[str] = Field(default_factory=list, max_length=8)
    custom_topic: str | None = Field(default=None, max_length=160)
    discovery_type: Literal["business_opportunities", "unsolved_problems", "market_gaps", "emerging_trends"]
    query: str | None = Field(default=None, max_length=600)
    filters: FiltersIn = FiltersIn()

    @field_validator("industries")
    @classmethod
    def clean_industries(cls, v: list[str]) -> list[str]:
        out = [s.strip()[:80] for s in v if s and s.strip()]
        return list(dict.fromkeys(out))

    @field_validator("custom_topic", "query")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        return v.strip() or None if v else None


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    mode: Literal["explain", "challenge", "investigate", "build"] | None = None


class ConversationIn(BaseModel):
    title: str | None = Field(default=None, max_length=120)


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    home_country: str | None = Field(default=None, max_length=80)


class WatchIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)
