"""Schemas the LLM must satisfy. Outputs are validated with Pydantic, and every
reference (source ref / finding id) is re-checked against the database before use."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["low", "moderate", "high"]


# ---------- Stage 1: query planning ----------
class PlannedQuery(BaseModel):
    query: str = Field(description="A focused web search query (5-14 words). No quotes or operators.")
    purpose: str = Field(description="What this query is meant to uncover.")
    angle: Literal["problem", "demand", "change", "competition", "regulation", "counter_evidence"]


class QueryPlan(BaseModel):
    interpretation: str = Field(description="One or two sentences restating what the user wants to discover.")
    queries: list[PlannedQuery] = Field(min_length=3, max_length=8)
    geographic_note: str = Field(
        description="How location precision will be handled, e.g. city-level evidence may be scarce."
    )


# ---------- Stage 4: extraction ----------
class ExtractedFinding(BaseModel):
    source_ref: str = Field(description="The ref of the source this finding comes from, e.g. 'S3'.")
    finding_type: Literal[
        "customer_complaint",
        "emerging_demand",
        "behaviour_change",
        "adoption_barrier",
        "regulatory_change",
        "business_need",
        "product_limitation",
        "market_gap",
        "operational_inefficiency",
        "market_data",
        "competitor_or_solution",
        "counter_evidence",
    ]
    statement: str = Field(description="Faithful paraphrase of what the source says. No added facts.")
    quote: str | None = Field(
        default=None,
        description="An exact, verbatim sentence fragment (max 300 chars) copied from the source text that supports the statement. Null if none.",
    )
    claim_kind: Literal["observed_fact", "source_claim", "opinion"] = Field(
        description="observed_fact = verifiable data/event; source_claim = the source asserts it; opinion = commentary/speculation."
    )
    geographic_scope: str | None = Field(
        default=None, description="Geography the finding applies to, as stated or clearly implied by the source; null if unclear."
    )
    who_affected: str | None = None


class ExtractionResult(BaseModel):
    findings: list[ExtractedFinding] = Field(max_length=40)


# ---------- Stage 6: clustering ----------
class SignalCluster(BaseModel):
    title: str
    description: str = Field(description="The theme these findings jointly suggest. Mark interpretation as such.")
    finding_ids: list[str] = Field(min_length=1)


class ClusterResult(BaseModel):
    signals: list[SignalCluster] = Field(max_length=10)


# ---------- Stage 7/8: opportunity generation + evaluation ----------
class EvidenceRef(BaseModel):
    finding_id: str
    claim_supported: str = Field(description="The specific claim in this report that this finding supports or contradicts.")
    relevance: str = Field(description="Why this source matters for that claim.")


class DimensionScore(BaseModel):
    score: int = Field(ge=0, le=10)
    rationale: str = Field(description="One or two sentences grounded in the findings. Say so when evidence is missing.")


class Scores(BaseModel):
    demand: DimensionScore
    problem_severity: DimensionScore
    growth_momentum: DimensionScore
    market_gap: DimensionScore
    competition: DimensionScore = Field(description="Higher = less crowded / more room.")
    feasibility: DimensionScore
    evidence_quality: DimensionScore


class GroundedPoint(BaseModel):
    point: str
    finding_ids: list[str] = Field(default_factory=list, description="Findings backing this point. Empty = AI interpretation.")


class Alternative(BaseModel):
    name: str = Field(description="Existing product, company or approach — only if named in a finding.")
    description: str
    finding_ids: list[str] = Field(default_factory=list)


class Solution(BaseModel):
    kind: Literal[
        "saas", "marketplace", "local_service", "automation", "physical_product", "consulting", "platform", "other"
    ]
    name: str
    what_it_does: str
    who_uses_it: str
    value_proposition: str
    revenue_model: str
    mvp: str


class Audience(BaseModel):
    segment: str
    why: str


class Risk(BaseModel):
    risk: str
    severity: Literal["low", "medium", "high"]
    finding_ids: list[str] = Field(default_factory=list)


class Unknown(BaseModel):
    unknown: str
    how_to_validate: str


class ClaimBreakdown(BaseModel):
    observed_facts: list[GroundedPoint] = Field(default_factory=list)
    source_claims: list[GroundedPoint] = Field(default_factory=list)
    ai_interpretations: list[str] = Field(default_factory=list)
    estimates: list[str] = Field(default_factory=list)
    hypotheses: list[str] = Field(default_factory=list)


class Problem(BaseModel):
    what: str
    who: str
    why_it_matters: str
    frequency: str | None = Field(
        default=None, description="How often it is reported — only if the evidence supports a statement; else null."
    )


class GeneratedOpportunity(BaseModel):
    title: str = Field(description="Specific, concrete title (max ~12 words).")
    summary: str = Field(description="2-3 sentence overview.")
    plain_summary: str = Field(description="The same idea explained to a non-expert in 2 short sentences.")
    industry: str
    location_label: str = Field(description="Geographic scope the EVIDENCE supports (may be broader than requested).")
    geographic_precision: Literal["global", "country", "region", "city"]
    geographic_note: str | None = Field(default=None, description="Explain if evidence is broader than the requested location.")
    signal_titles: list[str] = Field(default_factory=list)
    problem: Problem
    target_audience: list[Audience] = Field(min_length=1, max_length=5)
    supporting_evidence: list[EvidenceRef] = Field(min_length=1)
    contradicting_evidence: list[EvidenceRef] = Field(default_factory=list)
    competitor_evidence: list[EvidenceRef] = Field(default_factory=list)
    evidence_connections: list[GroundedPoint] = Field(
        min_length=1, description="How the findings connect to suggest the opportunity."
    )
    why_now: list[GroundedPoint] = Field(
        default_factory=list, description="Recent changes creating the opening. Only include points backed by findings."
    )
    existing_alternatives: list[Alternative] = Field(default_factory=list)
    competition_note: str = Field(description="Market/competition discussion. Never claim there are no competitors.")
    solutions: list[Solution] = Field(min_length=1, max_length=4)
    risks: list[Risk] = Field(min_length=1)
    unknowns: list[Unknown] = Field(min_length=1)
    validation_steps: list[str] = Field(min_length=1, max_length=6)
    claim_breakdown: ClaimBreakdown
    scores: Scores
    score_explanation: str
    limitations: list[str] = Field(min_length=1)
    confidence: Confidence
    confidence_rationale: str
    growth_direction: Literal["rising", "stable", "declining"] | None = Field(
        default=None, description="ONLY set if findings include dated, comparable data over time. Otherwise null."
    )


class OpportunityResult(BaseModel):
    opportunities: list[GeneratedOpportunity] = Field(max_length=6)
    insufficient_evidence_note: str | None = Field(
        default=None, description="Set if evidence was too thin to support some or any opportunities."
    )


# ---------- Reassessment after debate ----------
class Reassessment(BaseModel):
    scores: Scores
    score_explanation: str
    limitations: list[str]
    confidence: Confidence
    confidence_rationale: str
    change_summary: str = Field(description="What changed versus the previous assessment and why. Say 'No change' if none.")
