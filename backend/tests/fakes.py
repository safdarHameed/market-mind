"""Test doubles. Used ONLY in tests — never wired into production flows."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.llm.base import LLMError, LLMProvider
from app.research.ai_schemas import (
    ClusterResult,
    ExtractionResult,
    OpportunityResult,
    QueryPlan,
)
from app.research.fetcher import FetchResult
from app.search.base import SearchProvider, SearchProviderError, SearchRequest, SearchResult

LONG = " ".join(["Independent retailers report that managing unsold inventory is a constant struggle."] * 8)


class FakeSearch(SearchProvider):
    name = "fake"

    def __init__(self, results: list[SearchResult] | None = None, fail: bool = False):
        self.results = results or []
        self.fail = fail
        self.calls: list[str] = []

    async def search(self, req: SearchRequest) -> list[SearchResult]:
        self.calls.append(req.query)
        if self.fail:
            raise SearchProviderError("Fake provider is down.")
        return list(self.results)


class FakeFetcher:
    def __init__(self, pages: dict[str, FetchResult]):
        self.pages = pages

    async def fetch(self, url: str) -> FetchResult:
        return self.pages.get(url, FetchResult(ok=False, status=404, note="Page returned HTTP 404."))

    async def aclose(self) -> None:
        return None


def opp_payload(support_ids: list[str], contra_ids: list[str] | None = None) -> dict[str, Any]:
    dim = {"score": 7, "rationale": "Grounded in findings."}
    return {
        "title": "Affordable inventory intelligence for small retailers",
        "summary": "Small retailers struggle with inventory.",
        "plain_summary": "Shops find stock hard to manage.",
        "industry": "Retail",
        "location_label": "United States",
        "geographic_precision": "country",
        "problem": {"what": "Unsold stock", "who": "Small retailers", "why_it_matters": "Cash tied up"},
        "target_audience": [{"segment": "Independent shops", "why": "Most affected"}],
        "supporting_evidence": [{"finding_id": f, "claim_supported": "Retailers struggle", "relevance": "Direct"} for f in support_ids],
        "contradicting_evidence": [{"finding_id": f, "claim_supported": "Low WTP", "relevance": "Counter"} for f in (contra_ids or [])],
        "evidence_connections": [{"point": "A + B suggest a gap", "finding_ids": support_ids}],
        "why_now": [],
        "existing_alternatives": [],
        "competition_note": "Search did not surface competitors; this does not mean none exist.",
        "solutions": [{"kind": "saas", "name": "Reorder", "what_it_does": "x", "who_uses_it": "y",
                       "value_proposition": "z", "revenue_model": "sub", "mvp": "csv"}],
        "risks": [{"risk": "Low willingness to pay", "severity": "high", "finding_ids": []}],
        "unknowns": [{"unknown": "WTP", "how_to_validate": "Interviews"}],
        "validation_steps": ["Interview owners"],
        "claim_breakdown": {"observed_facts": [], "source_claims": [], "ai_interpretations": ["gap"], "estimates": [], "hypotheses": []},
        "scores": {k: dim for k in ["demand", "problem_severity", "growth_momentum", "market_gap", "competition", "feasibility", "evidence_quality"]},
        "score_explanation": "Moderate.",
        "limitations": ["Few sources"],
        "confidence": "high",
        "confidence_rationale": "Several sources.",
        "growth_direction": None,
    }


class ScriptedLLM(LLMProvider):
    """Returns canned structured outputs per schema; can run the real validator to test rejection paths."""

    name = "fake"

    def __init__(self, handlers: dict[type, Callable[[str], dict[str, Any]]]):
        self.handlers = handlers
        self.calls: list[tuple[str, str]] = []

    def model_for(self, tier):
        return f"fake-{tier}"

    async def structured(self, *, system, prompt, schema, tier="smart", max_tokens=8000, validator=None):
        self.calls.append((schema.__name__, prompt))
        if schema not in self.handlers:
            raise LLMError(f"No handler for {schema.__name__}")
        result = schema.model_validate(self.handlers[schema](prompt))
        problems = validator(result) if validator else []
        if problems:
            raise LLMError("The AI returned invalid structured data twice. " + problems[0])
        return result

    async def chat(self, **kwargs):  # pragma: no cover
        raise NotImplementedError
        yield


def default_handlers(extraction: Callable[[str], dict] | None = None, opportunities: Callable[[str], dict] | None = None):
    def plan(_):
        return QueryPlan(
            interpretation="Find retail problems",
            queries=[{"query": f"q{i}", "purpose": "p", "angle": "problem"} for i in range(3)],
            geographic_note="Country-level",
        ).model_dump()

    def extract(prompt: str):
        refs = [r for r in ("S1", "S2", "S3", "S4") if f'ref="{r}"' in prompt]
        return {"findings": [
            {"source_ref": r, "finding_type": "customer_complaint",
             "statement": f"Retailers struggle with unsold inventory ({r}).",
             "quote": "managing unsold inventory is a constant struggle" if r == "S1" else "this sentence is not in the source",
             "claim_kind": "source_claim"} for r in refs]}

    def cluster(prompt: str):
        ids = [f"F{i}" for i in range(1, 10) if f"F{i} [" in prompt]
        return {"signals": [{"title": "Inventory pain", "description": "Several retailers struggle", "finding_ids": ids}]}

    def opps(prompt: str):
        ids = [f"F{i}" for i in range(1, 10) if f"F{i} (" in prompt]
        return {"opportunities": [opp_payload(ids)]}

    return {
        QueryPlan: plan,
        ExtractionResult: extraction or extract,
        ClusterResult: cluster,
        OpportunityResult: opportunities or opps,
    }
