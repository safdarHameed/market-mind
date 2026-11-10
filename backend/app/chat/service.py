"""Challenge & Debate: an opportunity-scoped conversation that can do new research.

Sources are numbered S1..Sn per opportunity (report evidence first, then sources
retrieved during debates in retrieval order). The model must cite them as [S#].
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.llm import LLMError, get_llm
from app.llm.base import ToolSpec
from app.models import Conversation, Message, Opportunity, ResearchSource, User, utcnow
from app.research.context import detect_source_type, fence_source
from app.research.dedupe import canonicalize_url, domain_of
from app.research.fetcher import PageFetcher, content_hash, parse_date, sanitize_text
from app.research.prompts import INTEGRITY_RULES, PLAIN_WRITING, UNTRUSTED_NOTICE
from app.search.base import SearchProviderError, SearchRequest
from app.search.providers import get_search_provider

MODES = {
    "explain": "EXPLAIN mode: explain the opportunity in plain, friendly language. Avoid jargon. Keep it short.",
    "challenge": (
        "CHALLENGE mode: act as a rigorous skeptic. Find weaknesses, alternative explanations, missing evidence, "
        "and reasons this could fail. Don't soften conclusions to please the user."
    ),
    "investigate": (
        "INVESTIGATE mode: prefer retrieving new public evidence with the search tool to answer the question, "
        "then compare it with the existing evidence."
    ),
    "build": (
        "BUILD mode: turn the opportunity into a concrete plan — product scope, first customers, MVP, pricing "
        "hypotheses, validation experiments. Mark every assumption as an assumption."
    ),
}

SYSTEM = """You are MarketMind's debate partner for ONE specific opportunity report.
Your job is to help the user think critically — not to sell the opportunity and not to agree by default.

How to respond:
- When the user objects, take the objection seriously: restate it, identify what evidence would settle it, check the existing sources, and use the search tool if new evidence is needed. Then say whether your assessment changes and why.
- If the user is overly optimistic, push back with the risks and contradicting evidence.
- Cite sources inline as [S#] using only the refs listed below or returned by the search tool. Every new factual claim needs a citation.
- Clearly separate: what sources say, what you infer, and what is unknown. Use phrases like "Source S3 reports…", "My interpretation is…", "I don't have enough evidence to confirm that."
- When you used the search tool, say explicitly which points come from NEWLY retrieved sources versus the original report.
- Never invent sources, URLs, numbers, dates or company names. If the search returns nothing useful, say so.
- If the user asks for an updated score, explain your view and tell them they can use "Update assessment" to re-score with the debate included.
- Be concise: start with a one-line direct answer, then at most 3-5 short bullets. Usually under 150 words unless the user asks for depth. Use Markdown sparingly (bold, bullets).

""" + PLAIN_WRITING + "\n" + INTEGRITY_RULES + "\n" + UNTRUSTED_NOTICE


def opportunity_sources(db: Session, opp: Opportunity) -> list[ResearchSource]:
    """Stable ordering: report evidence sources first, then debate sources by retrieval time."""
    seen: dict[str, ResearchSource] = {}
    for ev in opp.evidence:
        if ev.origin == "report" and ev.source_id not in seen:
            seen[ev.source_id] = ev.source
    debate = db.scalars(
        select(ResearchSource).where(ResearchSource.opportunity_id == opp.id).order_by(ResearchSource.created_at)
    ).all()
    for s in debate:
        seen.setdefault(s.id, s)
    return list(seen.values())


def source_refs(db: Session, opp: Opportunity) -> dict[str, ResearchSource]:
    return {f"S{i + 1}": s for i, s in enumerate(opportunity_sources(db, opp))}


def report_context(db: Session, opp: Opportunity) -> str:
    refs = source_refs(db, opp)
    ref_of = {s.id: r for r, s in refs.items()}
    score = opp.current_score

    def cite(ids: list[str]) -> str:
        r = [ref_of[i] for i in ids if i in ref_of]
        return f" [{', '.join(r)}]" if r else " [AI interpretation]"

    ev_lines = []
    for ev in opp.evidence:
        ev_lines.append(f"- ({ev.stance}{', from debate' if ev.origin != 'report' else ''}) {ref_of.get(ev.source_id, '?')}: "
                        f"{ev.claim_supported} — {ev.relevance}")
    report = {
        "title": opp.title,
        "summary": opp.summary,
        "industry": opp.industry,
        "location": f"{opp.location_label} (evidence precision: {opp.geographic_precision}). {opp.geographic_note or ''}",
        "problem": opp.problem,
        "target_audience": opp.target_audience,
        "competition_note": opp.competition_note,
        "existing_alternatives": [a["name"] + ": " + a["description"] + cite(a.get("source_ids", [])) for a in opp.existing_alternatives],
        "solutions": [s["name"] + " — " + s["what_it_does"] for s in opp.solutions],
        "risks": [f"{r['risk']} ({r['severity']}){cite(r.get('source_ids', []))}" for r in opp.risks],
        "unknowns": [u["unknown"] for u in opp.unknowns],
        "evidence_connections": [p["point"] + cite(p.get("source_ids", [])) for p in opp.evidence_connections],
        "why_now": [p["point"] + cite(p.get("source_ids", [])) for p in opp.why_now],
        "hypotheses": (opp.claim_breakdown or {}).get("hypotheses", []),
    }
    if score:
        report["score"] = {
            "overall": score.overall,
            "confidence": score.confidence,
            "dimensions": {k: f"{v['score']}/10 — {v['rationale']}" for k, v in score.dimensions.items()},
            "limitations": score.limitations,
        }
    src_blocks = "\n".join(
        fence_source(ref, s, 1200) + ("\n(retrieved during a debate)" if s.origin != "discovery" else "")
        for ref, s in refs.items()
    )
    return (
        "OPPORTUNITY REPORT (AI-generated analysis; treat as claims to be tested):\n"
        + json.dumps(report, ensure_ascii=False, indent=1)
        + "\n\nEVIDENCE LINKS:\n" + "\n".join(ev_lines)
        + f"\n\nSOURCES ({len(refs)} total):\n" + src_blocks
    )


CITE_RX = re.compile(r"\[(S\d+(?:\s*,\s*S\d+)*)\]")


def extract_citations(text: str, refs: dict[str, ResearchSource], new_ids: set[str]) -> list[dict[str, Any]]:
    out, seen = [], set()
    for m in CITE_RX.finditer(text):
        for ref in re.split(r"\s*,\s*", m.group(1)):
            s = refs.get(ref)
            if s and ref not in seen:
                seen.add(ref)
                out.append({"ref": ref, "source_id": s.id, "is_new": s.id in new_ids})
    return out


async def research_for_opportunity(db: Session, opp: Opportunity, query: str, max_results: int = 5) -> list[ResearchSource]:
    """Search + fetch + store new sources linked to this opportunity. Returns the new, usable sources."""
    provider = get_search_provider(opp.discovery.user_id)
    if provider is None:
        raise SearchProviderError("No search provider configured.")
    fetcher = PageFetcher()
    try:
        results = await provider.search(SearchRequest(query=query, max_results=max_results, days=None))
        existing = {s.canonical_url for s in db.scalars(
            select(ResearchSource).where(ResearchSource.discovery_id == opp.discovery_id)).all()}
        fresh = []
        for r in results:
            canon = canonicalize_url(r.url)
            if canon in existing or not r.url.startswith(("http://", "https://")):
                continue
            existing.add(canon)
            fresh.append(r)
        fetched = await asyncio.gather(*(fetcher.fetch(r.url) for r in fresh))
        out = []
        for r, fr in zip(fresh, fetched):
            published = fr.published_at or parse_date(r.published)
            src = ResearchSource(
                discovery_id=opp.discovery_id, opportunity_id=opp.id, origin="debate",
                url=r.url, canonical_url=canonicalize_url(r.url),
                title=sanitize_text(fr.title or r.title)[:500], publisher=fr.site_name or r.publisher,
                domain=domain_of(r.url), published_at=published,
                published_at_source=("page_metadata" if fr.published_at else "search_provider") if published else None,
                retrieved_at=utcnow(), source_type=detect_source_type(domain_of(r.url), r.url),
                search_query=query, search_provider=provider.name,
                snippet=sanitize_text(r.snippet)[:2000] if r.snippet else None, http_status=fr.status,
            )
            if fr.ok and fr.text:
                src.verification_status, src.content_excerpt, src.content_hash = "verified", fr.text, content_hash(fr.text)
            elif r.snippet and len(r.snippet) >= 80:
                src.verification_status = "snippet_only"
                src.verification_note = (fr.note or "Page could not be read.") + " Using the search snippet only."
            else:
                src.verification_status, src.verification_note = "unreachable", fr.note
            db.add(src)
            if src.verification_status != "unreachable":
                out.append(src)
        db.commit()
        return out
    finally:
        await provider.aclose()
        await fetcher.aclose()


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


async def stream_reply(db: Session, conv: Conversation, opp: Opportunity, user_text: str, mode: str | None) -> AsyncIterator[str]:
    llm = get_llm(conv.user_id)
    history = [{"role": m.role, "content": m.content} for m in conv.messages if m.status == "complete"][-20:]

    user_msg = Message(conversation_id=conv.id, role="user", content=user_text, mode=mode)
    db.add(user_msg)
    if conv.title == "New discussion":
        conv.title = user_text[:80]
    conv.updated_at = utcnow()
    db.commit()
    yield sse("user_message", {"id": user_msg.id, "created_at": user_msg.created_at.isoformat()})

    new_ids: set[str] = set()
    queries: list[str] = []

    async def search_tool(args: dict[str, Any]) -> str:
        q = str(args.get("query", "")).strip()[:300]
        if not q:
            return "Empty query."
        queries.append(q)
        start_refs = len(source_refs(db, opp))
        try:
            found = await research_for_opportunity(db, opp, q)
        except SearchProviderError as e:
            return f"Search unavailable: {e}"
        refs = source_refs(db, opp)
        new_refs = {r: s for r, s in refs.items() if s.id in {x.id for x in found}}
        new_ids.update(s.id for s in found)
        if not new_refs:
            return f"Search for '{q}' returned no new readable sources (existing sources: {start_refs}). Say so honestly."
        return (
            f"NEW sources retrieved for '{q}' (cite as shown; these are newly retrieved, not part of the original report):\n"
            + "\n".join(fence_source(r, s, 2500) for r, s in new_refs.items())
        )

    tools = [
        ToolSpec(
            name="search_public_sources",
            description=(
                "Search the public web for NEW evidence about this opportunity (competitors, pricing, complaints, "
                "data, counter-evidence). Returns readable sources with refs to cite. Use specific queries. "
                "Use at most 2 times per reply."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Focused search query, 5-14 words."},
                    "reason": {"type": "string", "description": "What question this search should answer."},
                },
                "required": ["query"],
            },
            handler=search_tool,
        )
    ]
    probe = get_search_provider(conv.user_id)
    if probe is None:
        tools = []
    else:
        await probe.aclose()

    user = db.get(User, conv.user_id)
    profile = (
        f"The user's home country is {user.home_country}. Use it when they say 'my country'.\n\n"
        if user and user.home_country else ""
    )
    system = SYSTEM + "\n\n" + profile + (MODES.get(mode or "", "") + "\n\n" if mode else "") + report_context(db, opp)
    text_parts: list[str] = []
    try:
        async for ev in llm.chat(
            system=system,
            messages=history + [{"role": "user", "content": user_text}],
            tools=tools,
            tier="smart",
            max_tool_rounds=2,
        ):
            if ev.type == "text":
                text_parts.append(ev.text)
                yield sse("delta", {"text": ev.text})
            elif ev.type == "tool_start":
                yield sse("status", {"text": f"Searching public sources: “{ev.data.get('input', {}).get('query', '')}”"})
            elif ev.type == "tool_end":
                if text_parts and not "".join(text_parts).endswith("\n"):
                    text_parts.append("\n\n")
                    yield sse("delta", {"text": "\n\n"})
                yield sse("status", {"text": "Reading new sources…"})
    except LLMError as e:
        content = "".join(text_parts).strip()
        msg = Message(conversation_id=conv.id, role="assistant", content=content or str(e), mode=mode, status="error")
        db.add(msg)
        db.commit()
        yield sse("error", {"message": str(e)})
        return

    content = "".join(text_parts).strip() or "I couldn't produce a response. Please try rephrasing."
    refs = source_refs(db, opp)
    citations = extract_citations(content, refs, new_ids)
    msg = Message(conversation_id=conv.id, role="assistant", content=content, mode=mode,
                  citations=citations, research_queries=queries)
    db.add(msg)
    conv.updated_at = utcnow()
    db.commit()
    yield sse("done", {"message_id": msg.id, "citations": citations, "research_queries": queries,
                       "new_source_ids": sorted(new_ids)})
