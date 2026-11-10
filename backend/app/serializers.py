"""Convert ORM objects into API payloads. Never includes secrets or raw page text beyond excerpts."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import (
    Conversation,
    Discovery,
    Message,
    Opportunity,
    OpportunityEvidence,
    OpportunityScore,
    ResearchSource,
)
from app.research.scoring import DIMENSIONS, evidence_strength
from app.research.context import DISCOVERY_TYPES


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def excerpt_for(s: ResearchSource, finding_quote: str | None = None) -> str | None:
    if finding_quote:
        return finding_quote
    if s.snippet:
        return s.snippet[:500]
    if s.content_excerpt:
        return s.content_excerpt[:500]
    return None


def source_out(s: ResearchSource, *, include_excerpt: bool = True) -> dict[str, Any]:
    return {
        "id": s.id,
        "url": s.url,
        "title": s.title,
        "publisher": s.publisher,
        "domain": s.domain,
        "published_at": iso(s.published_at),
        "published_at_source": s.published_at_source,
        "retrieved_at": iso(s.retrieved_at),
        "source_type": s.source_type,
        "origin": s.origin,
        "verification_status": s.verification_status,
        "verification_note": s.verification_note,
        "duplicate_of_id": s.duplicate_of_id,
        "duplicate_reason": s.duplicate_reason,
        "search_query": s.search_query,
        "excerpt": excerpt_for(s) if include_excerpt else None,
    }


def score_out(sc: OpportunityScore | None) -> dict[str, Any] | None:
    if sc is None:
        return None
    return {
        "version": sc.version,
        "overall": sc.overall,
        "raw_overall": sc.raw_overall,
        "confidence": sc.confidence,
        "confidence_rationale": sc.confidence_rationale,
        "explanation": sc.explanation,
        "limitations": sc.limitations,
        "cap_reason": sc.cap_reason,
        "reason": sc.reason,
        "change_summary": sc.change_summary,
        "created_at": iso(sc.created_at),
        "dimensions": [
            {"key": k, "label": label, "weight": w, "description": desc,
             "score": (sc.dimensions.get(k) or {}).get("score"), "rationale": (sc.dimensions.get(k) or {}).get("rationale")}
            for k, (label, w, desc) in DIMENSIONS.items()
        ],
    }


def opportunity_card(o: Opportunity, d: Discovery | None = None) -> dict[str, Any]:
    sc = o.current_score
    return {
        "id": o.id,
        "discovery_id": o.discovery_id,
        "title": o.title,
        "summary": o.summary,
        "industry": o.industry,
        "location_label": o.location_label,
        "geographic_precision": o.geographic_precision,
        "score": sc.overall if sc else None,
        "confidence": sc.confidence if sc else None,
        "evidence_strength": evidence_strength(o.supporting_count, sc.confidence if sc else "low"),
        "independent_source_count": o.independent_source_count,
        "supporting_count": o.supporting_count,
        "contradicting_count": o.contradicting_count,
        "growth_direction": o.growth_direction,
        "is_demo": (d or o.discovery).is_demo,
        "created_at": iso(o.created_at),
    }


def discovery_summary(d: Discovery) -> dict[str, Any]:
    return {
        "id": d.id,
        "title": d.title,
        "status": d.status,
        "stage": d.stage,
        "discovery_type": d.discovery_type,
        "discovery_type_label": DISCOVERY_TYPES.get(d.discovery_type, (d.discovery_type,))[0],
        "location": d.location,
        "industries": d.industries,
        "custom_topic": d.custom_topic,
        "query": d.query,
        "is_demo": d.is_demo,
        "created_at": iso(d.created_at),
        "completed_at": iso(d.completed_at),
        "opportunity_count": len(d.opportunities) if d.status == "completed" else 0,
        "error": d.error,
    }


def opportunity_answer(o: Opportunity, d: Discovery) -> dict[str, Any]:
    """Card + the essentials for showing an opportunity as a direct answer (results page)."""
    supporting = [ev for ev in o.evidence if ev.stance == "supporting"]
    top = []
    for ev in supporting[:3]:
        s = ev.source
        top.append({
            "claim": ev.finding.statement if ev.finding else ev.claim_supported,
            "domain": s.domain,
            "url": s.url,
            "title": s.title,
            "is_sample": s.verification_status == "sample",
        })
    risks = sorted(o.risks or [], key=lambda r: {"high": 0, "medium": 1, "low": 2}.get(r.get("severity"), 3))
    return opportunity_card(o, d) | {
        "plain_summary": o.plain_summary,
        "who": (o.problem or {}).get("who"),
        "top_evidence": top,
        "main_risk": risks[0]["risk"] if risks else None,
    }


def discovery_detail(d: Discovery) -> dict[str, Any]:
    return {
        **discovery_summary(d),
        "filters": d.filters,
        "progress": d.progress or [],
        "stats": d.stats or {},
        "query_plan": d.query_plan,
        "search_provider": d.search_provider,
        "llm_model": d.llm_model,
        "started_at": iso(d.started_at),
        "opportunities": [opportunity_answer(o, d) for o in d.opportunities] if d.status == "completed" else [],
    }


def evidence_out(ev: OpportunityEvidence) -> dict[str, Any]:
    f = ev.finding
    return {
        "id": ev.id,
        "stance": ev.stance,
        "origin": ev.origin,
        "claim_supported": ev.claim_supported,
        "relevance": ev.relevance,
        "finding": {
            "id": f.id, "statement": f.statement, "quote": f.quote, "quote_verified": f.quote_verified,
            "finding_type": f.finding_type, "claim_kind": f.claim_kind, "geographic_scope": f.geographic_scope,
        } if f else None,
        "source": source_out(ev.source),
        "created_at": iso(ev.created_at),
    }


def opportunity_report(o: Opportunity, sources: list[ResearchSource], *, public: bool = False) -> dict[str, Any]:
    d = o.discovery
    ref_map = {s.id: f"S{i + 1}" for i, s in enumerate(sources)}
    return {
        **opportunity_card(o, d),
        "plain_summary": o.plain_summary,
        "geographic_note": o.geographic_note,
        "problem": o.problem,
        "target_audience": o.target_audience,
        "evidence_connections": o.evidence_connections,
        "why_now": o.why_now,
        "existing_alternatives": o.existing_alternatives,
        "competition_note": o.competition_note,
        "solutions": o.solutions,
        "risks": o.risks,
        "unknowns": o.unknowns,
        "validation_steps": o.validation_steps,
        "claim_breakdown": o.claim_breakdown,
        "signals": [{"id": s.id, "title": s.title, "description": s.description,
                     "independent_source_count": s.independent_source_count} for s in o.signals],
        "evidence": [evidence_out(ev) for ev in o.evidence],
        "sources": [source_out(s) | {"ref": ref_map[s.id]} for s in sources],
        "score_detail": score_out(o.current_score),
        "score_history": [{"version": s.version, "overall": s.overall, "confidence": s.confidence, "reason": s.reason,
                           "created_at": iso(s.created_at), "change_summary": s.change_summary} for s in o.scores],
        "discovery": {
            "id": d.id, "title": d.title, "location": d.location, "discovery_type": d.discovery_type,
            "industries": d.industries, "created_at": iso(d.created_at), "completed_at": iso(d.completed_at),
            "stats": d.stats or {}, "search_provider": d.search_provider, "is_demo": d.is_demo,
        } if not public else {
            "title": d.title, "created_at": iso(d.created_at), "stats": d.stats or {}, "is_demo": d.is_demo,
            "search_provider": d.search_provider,
        },
    }


def message_out(m: Message) -> dict[str, Any]:
    return {
        "id": m.id, "role": m.role, "mode": m.mode, "content": m.content, "citations": m.citations or [],
        "research_queries": m.research_queries or [], "status": m.status, "created_at": iso(m.created_at),
    }


def conversation_out(c: Conversation, with_messages: bool = False) -> dict[str, Any]:
    out = {"id": c.id, "opportunity_id": c.opportunity_id, "title": c.title,
           "created_at": iso(c.created_at), "updated_at": iso(c.updated_at), "message_count": len(c.messages)}
    if with_messages:
        out["messages"] = [message_out(m) for m in c.messages]
    return out
