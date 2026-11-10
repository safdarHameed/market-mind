"""Database model.

Design principle: *source evidence* (ResearchSource, Finding with verified quotes)
is stored separately from *AI interpretation* (Signal, Opportunity, scores).
Every OpportunityEvidence row points at a real ResearchSource row.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

JsonType = JSON().with_variant(JSONB(), "postgresql")


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    display_name: Mapped[str | None] = mapped_column(String(80))
    home_country: Mapped[str | None] = mapped_column(String(80))

    discoveries: Mapped[list["Discovery"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    ai_settings: Mapped["UserAISettings | None"] = relationship(cascade="all, delete-orphan", uselist=False)


class Discovery(TimestampMixin, Base):
    __tablename__ = "discoveries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # Request
    location: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)  # {level,label,country,region,city}
    industries: Mapped[list[str]] = mapped_column(JsonType, default=list)
    custom_topic: Mapped[str | None] = mapped_column(String(200))
    discovery_type: Mapped[str] = mapped_column(String(40))
    query: Mapped[str | None] = mapped_column(Text)
    filters: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    title: Mapped[str] = mapped_column(String(300))

    # Execution
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)  # queued|running|completed|failed
    stage: Mapped[str | None] = mapped_column(String(40))
    progress: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)  # real stage events
    error: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    search_provider: Mapped[str | None] = mapped_column(String(40))
    llm_model: Mapped[str | None] = mapped_column(String(80))
    query_plan: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    stats: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="discoveries")
    sources: Mapped[list["ResearchSource"]] = relationship(back_populates="discovery", cascade="all, delete-orphan")
    findings: Mapped[list["Finding"]] = relationship(back_populates="discovery", cascade="all, delete-orphan")
    signals: Mapped[list["Signal"]] = relationship(back_populates="discovery", cascade="all, delete-orphan")
    opportunities: Mapped[list["Opportunity"]] = relationship(
        back_populates="discovery", cascade="all, delete-orphan", order_by="Opportunity.rank"
    )

    __table_args__ = (Index("ix_discoveries_user_created", "user_id", "created_at"),)


class ResearchSource(TimestampMixin, Base):
    """A real, retrieved web page. Metadata is only what was actually observed."""

    __tablename__ = "research_sources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    discovery_id: Mapped[str] = mapped_column(ForeignKey("discoveries.id", ondelete="CASCADE"), index=True)
    # Sources retrieved during a debate are tied to the opportunity that triggered them.
    opportunity_id: Mapped[str | None] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True)
    origin: Mapped[str] = mapped_column(String(20), default="discovery")  # discovery|debate|recheck

    url: Mapped[str] = mapped_column(Text)
    canonical_url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    publisher: Mapped[str | None] = mapped_column(String(200))
    domain: Mapped[str] = mapped_column(String(200), index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at_source: Mapped[str | None] = mapped_column(String(40))  # page_metadata|search_provider
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source_type: Mapped[str] = mapped_column(String(40), default="web_page")
    search_query: Mapped[str | None] = mapped_column(Text)
    search_provider: Mapped[str | None] = mapped_column(String(40))

    snippet: Mapped[str | None] = mapped_column(Text)  # provider-supplied snippet
    content_excerpt: Mapped[str | None] = mapped_column(Text)  # sanitized page text (truncated)
    content_hash: Mapped[str | None] = mapped_column(String(64))

    # verified: fetched OK with readable text; snippet_only: page not fetchable but the
    # search provider returned text; unreachable: excluded from evidence.
    verification_status: Mapped[str] = mapped_column(String(20), default="pending")
    verification_note: Mapped[str | None] = mapped_column(Text)
    http_status: Mapped[int | None] = mapped_column(Integer)
    duplicate_of_id: Mapped[str | None] = mapped_column(ForeignKey("research_sources.id", ondelete="SET NULL"))
    duplicate_reason: Mapped[str | None] = mapped_column(String(80))

    discovery: Mapped[Discovery] = relationship(back_populates="sources")
    findings: Mapped[list["Finding"]] = relationship(back_populates="source", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("discovery_id", "canonical_url", name="uq_source_discovery_url"),)

    @property
    def is_usable(self) -> bool:
        return self.verification_status in ("verified", "snippet_only") and self.duplicate_of_id is None


class Finding(TimestampMixin, Base):
    """A structured claim extracted from exactly one source."""

    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    discovery_id: Mapped[str] = mapped_column(ForeignKey("discoveries.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("research_sources.id", ondelete="CASCADE"), index=True)
    finding_type: Mapped[str] = mapped_column(String(40))
    statement: Mapped[str] = mapped_column(Text)  # paraphrase of what the source says
    quote: Mapped[str | None] = mapped_column(Text)  # only kept if it literally appears in the source text
    quote_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    claim_kind: Mapped[str] = mapped_column(String(30), default="source_claim")  # observed_fact|source_claim|opinion
    geographic_scope: Mapped[str | None] = mapped_column(String(120))
    who_affected: Mapped[str | None] = mapped_column(Text)
    duplicate_of_id: Mapped[str | None] = mapped_column(ForeignKey("findings.id", ondelete="SET NULL"))

    discovery: Mapped[Discovery] = relationship(back_populates="findings")
    source: Mapped[ResearchSource] = relationship(back_populates="findings")


class SignalFinding(Base):
    __tablename__ = "signal_findings"
    signal_id: Mapped[str] = mapped_column(ForeignKey("signals.id", ondelete="CASCADE"), primary_key=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True)


class Signal(TimestampMixin, Base):
    """A theme formed by clustering related findings (AI interpretation)."""

    __tablename__ = "signals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    discovery_id: Mapped[str] = mapped_column(ForeignKey("discoveries.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    independent_source_count: Mapped[int] = mapped_column(Integer, default=0)

    discovery: Mapped[Discovery] = relationship(back_populates="signals")
    findings: Mapped[list[Finding]] = relationship(secondary="signal_findings")


class OpportunitySignal(Base):
    __tablename__ = "opportunity_signals"
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), primary_key=True)
    signal_id: Mapped[str] = mapped_column(ForeignKey("signals.id", ondelete="CASCADE"), primary_key=True)


class Opportunity(TimestampMixin, Base):
    __tablename__ = "opportunities"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    discovery_id: Mapped[str] = mapped_column(ForeignKey("discoveries.id", ondelete="CASCADE"), index=True)
    rank: Mapped[int] = mapped_column(Integer, default=0)

    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text)
    plain_summary: Mapped[str | None] = mapped_column(Text)
    industry: Mapped[str] = mapped_column(String(120))
    location_label: Mapped[str] = mapped_column(String(200))
    geographic_precision: Mapped[str] = mapped_column(String(20))  # global|country|region|city
    geographic_note: Mapped[str | None] = mapped_column(Text)

    # Structured report sections (AI interpretation, references validated against DB ids)
    problem: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    target_audience: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    evidence_connections: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    why_now: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    existing_alternatives: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    competition_note: Mapped[str | None] = mapped_column(Text)
    solutions: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    risks: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    unknowns: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    validation_steps: Mapped[list[str]] = mapped_column(JsonType, default=list)
    claim_breakdown: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)

    growth_direction: Mapped[str | None] = mapped_column(String(20))  # only set when time-series evidence exists
    independent_source_count: Mapped[int] = mapped_column(Integer, default=0)
    supporting_count: Mapped[int] = mapped_column(Integer, default=0)
    contradicting_count: Mapped[int] = mapped_column(Integer, default=0)

    discovery: Mapped[Discovery] = relationship(back_populates="opportunities")
    evidence: Mapped[list["OpportunityEvidence"]] = relationship(
        back_populates="opportunity", cascade="all, delete-orphan", order_by="OpportunityEvidence.created_at"
    )
    scores: Mapped[list["OpportunityScore"]] = relationship(
        back_populates="opportunity", cascade="all, delete-orphan", order_by="OpportunityScore.version"
    )
    signals: Mapped[list[Signal]] = relationship(secondary="opportunity_signals")

    @property
    def current_score(self) -> "OpportunityScore | None":
        return self.scores[-1] if self.scores else None


class OpportunityEvidence(TimestampMixin, Base):
    __tablename__ = "opportunity_evidence"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("research_sources.id", ondelete="CASCADE"), index=True)
    finding_id: Mapped[str | None] = mapped_column(ForeignKey("findings.id", ondelete="SET NULL"))
    stance: Mapped[str] = mapped_column(String(20))  # supporting|contradicting|competitor|context
    claim_supported: Mapped[str] = mapped_column(Text)
    relevance: Mapped[str] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(String(20), default="report")  # report|debate|recheck

    opportunity: Mapped[Opportunity] = relationship(back_populates="evidence")
    source: Mapped[ResearchSource] = relationship()
    finding: Mapped[Finding | None] = relationship()

    __table_args__ = (UniqueConstraint("opportunity_id", "source_id", "stance", "claim_supported", name="uq_evidence"),)


class OpportunityScore(TimestampMixin, Base):
    """Versioned score. Version 1 comes from the report, later versions from reassessment."""

    __tablename__ = "opportunity_scores"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    overall: Mapped[int] = mapped_column(Integer)
    raw_overall: Mapped[float] = mapped_column(Float)  # before evidence cap
    dimensions: Mapped[dict[str, Any]] = mapped_column(JsonType)  # {key: {score, rationale}}
    explanation: Mapped[str] = mapped_column(Text)
    limitations: Mapped[list[str]] = mapped_column(JsonType, default=list)
    confidence: Mapped[str] = mapped_column(String(20))  # low|moderate|high
    confidence_rationale: Mapped[str] = mapped_column(Text, default="")
    cap_reason: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(String(30), default="initial")  # initial|reassessment
    change_summary: Mapped[str | None] = mapped_column(Text)

    opportunity: Mapped[Opportunity] = relationship(back_populates="scores")

    __table_args__ = (UniqueConstraint("opportunity_id", "version", name="uq_score_version"),)


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="New discussion")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(TimestampMixin, Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user|assistant
    mode: Mapped[str | None] = mapped_column(String(20))  # explain|challenge|investigate|build
    content: Mapped[str] = mapped_column(Text)
    # Sources cited/retrieved in this message: [{id, is_new}]
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    research_queries: Mapped[list[str]] = mapped_column(JsonType, default=list)
    status: Mapped[str] = mapped_column(String(20), default="complete")  # complete|error

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class SavedOpportunity(TimestampMixin, Base):
    __tablename__ = "saved_opportunities"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"))
    score_at_save: Mapped[int | None] = mapped_column(Integer)

    opportunity: Mapped[Opportunity] = relationship()
    __table_args__ = (UniqueConstraint("user_id", "opportunity_id", name="uq_saved"),)


class WatchlistItem(TimestampMixin, Base):
    __tablename__ = "watchlist_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"))
    score_at_add: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    opportunity: Mapped[Opportunity] = relationship()
    __table_args__ = (UniqueConstraint("user_id", "opportunity_id", name="uq_watch"),)


class UserAISettings(Base):
    """Per-user AI + search provider configuration. API keys are stored encrypted."""

    __tablename__ = "user_ai_settings"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    llm_provider: Mapped[str | None] = mapped_column(String(40))
    llm_model: Mapped[str | None] = mapped_column(String(200))
    llm_base_url: Mapped[str | None] = mapped_column(String(500))
    llm_api_key_enc: Mapped[str | None] = mapped_column(Text)
    search_provider: Mapped[str] = mapped_column(String(20), default="auto")
    search_api_key_enc: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ShareLink(TimestampMixin, Base):
    __tablename__ = "share_links"

    token: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
