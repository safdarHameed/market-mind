"""MarketMind research pipeline.

plan -> retrieve -> validate -> deduplicate -> extract -> cluster -> generate/evaluate -> persist

Each stage records a real progress event on the Discovery row (no simulated progress).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.llm import LLMError, LLMProvider, get_llm
from app.models import (
    Discovery,
    Finding,
    Opportunity,
    OpportunityEvidence,
    OpportunityScore,
    OpportunitySignal,
    ResearchSource,
    Signal,
    SignalFinding,
    utcnow,
)
from app.research import prompts
from app.research.ai_schemas import (
    ClusterResult,
    ExtractionResult,
    GeneratedOpportunity,
    GroundedPoint,
    OpportunityResult,
    QueryPlan,
)
from app.research.context import (
    TIME_PERIOD_DAYS,
    describe_request,
    detect_source_type,
    fence_source,
    quote_in_source,
)
from app.research.dedupe import canonicalize_url, domain_of, independent_count, mark_duplicates
from app.research.fetcher import PageFetcher, content_hash, parse_date, sanitize_text
from app.research.scoring import compute_score
from app.search.base import SearchProvider, SearchProviderError, SearchRequest, SearchResult
from app.search.providers import get_search_provider

log = logging.getLogger(__name__)

STAGES: list[tuple[str, str]] = [
    ("planning", "Planning the search"),
    ("retrieving", "Searching the web"),
    ("validating", "Reading the pages"),
    ("deduplicating", "Removing repeats"),
    ("extracting", "Pulling out key facts"),
    ("clustering", "Finding patterns"),
    ("generating", "Writing up opportunities"),
]


class PipelineError(Exception):
    """User-safe pipeline failure."""


class Progress:
    def __init__(self, db: Session, d: Discovery) -> None:
        self.db, self.d = db, d

    def _push(self, event: dict[str, Any]) -> None:
        events = [e for e in (self.d.progress or []) if e["stage"] != event["stage"]]
        events.append(event)
        self.d.progress = events
        self.db.commit()

    def start(self, stage: str) -> None:
        self.d.stage = stage
        label = dict(STAGES)[stage]
        self._push({"stage": stage, "label": label, "status": "active", "message": label + "…", "at": utcnow().isoformat()})

    def done(self, stage: str, message: str) -> None:
        self._push({"stage": stage, "label": dict(STAGES)[stage], "status": "done", "message": message, "at": utcnow().isoformat()})

    def fail(self, stage: str | None, message: str) -> None:
        if stage:
            self._push({"stage": stage, "label": dict(STAGES)[stage], "status": "error", "message": message, "at": utcnow().isoformat()})


# --------------------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------------------

_running: set[str] = set()


async def run_discovery(
    discovery_id: str,
    *,
    llm_factory: Callable[[str | None], LLMProvider] = get_llm,
    search_factory: Callable[[str | None], SearchProvider | None] = get_search_provider,
    fetcher_factory: Callable[[], Any] = PageFetcher,
) -> None:
    if discovery_id in _running:
        return
    _running.add(discovery_id)
    db = SessionLocal()
    search: SearchProvider | None = None
    fetcher = None
    try:
        d = db.get(Discovery, discovery_id)
        if d is None:
            return
        progress = Progress(db, d)
        d.status, d.started_at, d.error, d.progress, d.stats = "running", utcnow(), None, [], {}
        db.commit()
        try:
            llm = llm_factory(d.user_id)
            search = search_factory(d.user_id)
            if search is None:
                raise PipelineError(
                    "No search provider is connected, so no real sources can be retrieved. "
                    "Add a Tavily or Brave key in Settings, or use Anthropic (which includes web search)."
                )
            fetcher = fetcher_factory()
            d.search_provider, d.llm_model = search.name, llm.model_for("smart")
            db.commit()
            await _run(db, d, progress, llm, search, fetcher)
            d.status, d.completed_at, d.stage = "completed", utcnow(), None
            db.commit()
        except (PipelineError, LLMError, SearchProviderError) as e:
            db.rollback()
            _fail(db, d, progress, str(e))
        except Exception:
            log.exception("Discovery %s crashed", discovery_id)
            db.rollback()
            _fail(db, d, progress, "Something went wrong while researching. You can retry this discovery.")
    finally:
        _running.discard(discovery_id)
        if search:
            await search.aclose()
        if fetcher:
            await fetcher.aclose()
        db.close()


def _fail(db: Session, d: Discovery, progress: Progress, message: str) -> None:
    progress.fail(d.stage, message)
    d.status, d.error, d.completed_at = "failed", message, utcnow()
    db.commit()


def reset_discovery(db: Session, d: Discovery) -> None:
    """Remove all derived data so a discovery can be re-run cleanly."""
    for model in (Opportunity, Signal, Finding):
        db.execute(delete(model).where(model.discovery_id == d.id))
    db.execute(delete(ResearchSource).where(ResearchSource.discovery_id == d.id))
    d.status, d.stage, d.error, d.progress, d.stats, d.query_plan = "queued", None, None, [], {}, None
    d.started_at = d.completed_at = None
    db.commit()


def recover_interrupted() -> int:
    """On startup, mark jobs that were running when the server stopped as failed (retryable)."""
    with SessionLocal() as db:
        rows = db.scalars(select(Discovery).where(Discovery.status.in_(("queued", "running")))).all()
        for d in rows:
            d.status, d.error = "failed", "Research was interrupted by a server restart. Retry to run it again."
        db.commit()
        return len(rows)


# --------------------------------------------------------------------------------------
# Stages
# --------------------------------------------------------------------------------------


async def _run(db: Session, d: Discovery, progress: Progress, llm: LLMProvider, search: SearchProvider, fetcher: Any) -> None:
    s = get_settings()
    request = describe_request(d)
    stats: dict[str, Any] = {}

    # 1. Query planning --------------------------------------------------------------
    progress.start("planning")
    plan = await llm.structured(
        system=prompts.PLANNER_SYSTEM,
        prompt=f"Discovery request:\n{request}\n\nToday's date: {utcnow().date().isoformat()}",
        schema=QueryPlan,
        tier="smart",
        max_tokens=2000,
    )
    queries = plan.queries[: s.research_max_queries]
    d.query_plan = {"interpretation": plan.interpretation, "geographic_note": plan.geographic_note,
                    "queries": [q.model_dump() for q in queries]}
    stats["queries"] = len(queries)
    progress.done("planning", f"Made {len(queries)} searches to run")

    # 2. Retrieval -------------------------------------------------------------------
    progress.start("retrieving")
    days = TIME_PERIOD_DAYS.get((d.filters or {}).get("time_period", "1y"), 365)
    country = (d.location or {}).get("country_code")
    sem = asyncio.Semaphore(3)

    async def one(q: str) -> tuple[str, list[SearchResult] | Exception]:
        async with sem:
            try:
                return q, await search.search(SearchRequest(query=q, max_results=s.research_results_per_query, days=days, country_code=country))
            except SearchProviderError as e:
                return q, e

    results = await asyncio.gather(*(one(q.query) for q in queries))
    errors = [r for _, r in results if isinstance(r, Exception)]
    if len(errors) == len(results):
        raise PipelineError(f"Search failed for every query. {errors[0]}")
    per_query = [(q, r) for q, r in results if not isinstance(r, Exception)]
    raw_count = sum(len(r) for _, r in per_query)

    # Round-robin across queries so every angle is represented, dropping exact-URL duplicates.
    seen: set[str] = set()
    picked: list[tuple[str, SearchResult]] = []
    for i in range(max((len(r) for _, r in per_query), default=0)):
        for q, r in per_query:
            if i < len(r) and len(picked) < s.research_max_sources:
                res = r[i]
                if not res.url.startswith(("http://", "https://")):
                    continue
                canon = canonicalize_url(res.url)
                if canon not in seen:
                    seen.add(canon)
                    picked.append((q, res))
    sources: list[ResearchSource] = []
    for q, res in picked:
        published = parse_date(res.published)
        src = ResearchSource(
            discovery_id=d.id,
            origin="discovery",
            url=res.url,
            canonical_url=canonicalize_url(res.url),
            title=sanitize_text(res.title)[:500] or domain_of(res.url),
            publisher=res.publisher,
            domain=domain_of(res.url),
            published_at=published,
            published_at_source="search_provider" if published else None,
            search_query=q,
            search_provider=search.name,
            snippet=sanitize_text(res.snippet)[:2000] if res.snippet else None,
            source_type=detect_source_type(domain_of(res.url), res.url),
            verification_status="pending",
        )
        db.add(src)
        sources.append(src)
    db.commit()
    stats.update(results_returned=raw_count, unique_urls=len(sources), failed_queries=len(errors))
    if not sources:
        raise PipelineError("The search found nothing. Try a wider place or a broader topic.")
    msg = f"Found {len(sources)} pages"
    if errors:
        msg += f" ({len(errors)} search{'' if len(errors) == 1 else 'es'} didn’t work)"
    progress.done("retrieving", msg)

    # 3. Validation ------------------------------------------------------------------
    progress.start("validating")
    fsem = asyncio.Semaphore(s.fetch_concurrency)

    async def fetch(src: ResearchSource):
        async with fsem:
            return src, await fetcher.fetch(src.url)

    for src, fr in await asyncio.gather(*(fetch(x) for x in sources)):
        src.retrieved_at = utcnow()
        src.http_status = fr.status
        if fr.ok and fr.text:
            src.verification_status = "verified"
            src.content_excerpt = fr.text
            src.content_hash = content_hash(fr.text)
            if fr.title:
                src.title = sanitize_text(fr.title)[:500]
            if fr.site_name:
                src.publisher = sanitize_text(fr.site_name)[:200]
            if fr.published_at:
                src.published_at, src.published_at_source = fr.published_at, "page_metadata"
        elif src.snippet and len(src.snippet) >= 80:
            src.verification_status = "snippet_only"
            src.verification_note = (fr.note or "Page could not be read.") + " Using the search provider's snippet only."
            src.content_hash = content_hash(src.snippet)
        else:
            src.verification_status = "unreachable"
            src.verification_note = fr.note or "Page could not be read."
    db.commit()
    verified = [x for x in sources if x.verification_status == "verified"]
    snippet_only = [x for x in sources if x.verification_status == "snippet_only"]
    unreachable = len(sources) - len(verified) - len(snippet_only)
    stats.update(verified=len(verified), snippet_only=len(snippet_only), unreachable=unreachable)
    progress.done("validating", f"Read {len(verified) + len(snippet_only)} pages" + (f", skipped {unreachable} we couldn’t open" if unreachable else ""))
    if not verified and not snippet_only:
        raise PipelineError("We couldn’t read any of the pages we found. Try again, or try a broader topic.")

    # 4. Deduplication ---------------------------------------------------------------
    progress.start("deduplicating")
    usable = verified + snippet_only  # verified first, so originals win over snippets
    dup_count = mark_duplicates(usable)
    db.commit()
    unique_sources = [x for x in usable if x.duplicate_of_id is None]
    stats.update(duplicates=dup_count, analyzed=len(unique_sources),
                 independent_publishers=independent_count([x.domain for x in unique_sources]))
    progress.done(
        "deduplicating",
        (f"Removed {dup_count} repeated article{'s' if dup_count != 1 else ''}. " if dup_count else "No repeats. ")
        + f"{len(unique_sources)} sources left",
    )

    # 5. Extraction ------------------------------------------------------------------
    progress.start("extracting")
    findings = await _extract(db, d, llm, request, unique_sources)
    stats["findings"] = len(findings)
    progress.done("extracting", f"Found {len(findings)} key facts in {len({f.source_id for f in findings})} sources")
    if not findings:
        d.stats = stats | {"opportunities": 0, "signals": 0,
                           "note": "The retrieved sources did not contain findings relevant to this request."}
        progress.start("clustering"); progress.done("clustering", "Skipped — no useful facts found")
        progress.start("generating"); progress.done("generating", "Not enough proof for any opportunity")
        return

    # 6. Clustering ------------------------------------------------------------------
    progress.start("clustering")
    fref = {f"F{i + 1}": f for i, f in enumerate(findings)}
    src_by_id = {x.id: x for x in unique_sources}
    sref = {x.id: f"S{i + 1}" for i, x in enumerate(unique_sources)}
    finding_lines = "\n".join(
        f"{ref} [{f.finding_type}; {f.claim_kind}; source {sref[f.source_id]} {src_by_id[f.source_id].domain}] {f.statement}"
        for ref, f in fref.items()
    )

    def check_clusters(r: ClusterResult) -> list[str]:
        return [f"Unknown finding id {fid}" for sig in r.signals for fid in sig.finding_ids if fid not in fref]

    clusters = await llm.structured(
        system=prompts.CLUSTER_SYSTEM,
        prompt=f"Discovery request:\n{request}\n\nFindings:\n{finding_lines}",
        schema=ClusterResult,
        tier="fast",
        max_tokens=4000,
        validator=check_clusters,
    )
    signals: list[tuple[Signal, list[str]]] = []
    for c in clusters.signals:
        members = [fref[x] for x in dict.fromkeys(c.finding_ids)]
        sig = Signal(discovery_id=d.id, title=c.title, description=c.description,
                     independent_source_count=independent_count([src_by_id[f.source_id].domain for f in members]))
        db.add(sig)
        db.flush()
        for f in members:
            db.add(SignalFinding(signal_id=sig.id, finding_id=f.id))
        signals.append((sig, list(dict.fromkeys(c.finding_ids))))
    db.commit()
    stats["signals"] = len(signals)
    progress.done("clustering", f"Found {len(signals)} pattern{'s' if len(signals) != 1 else ''}")

    # 7/8. Opportunity generation + evaluation ---------------------------------------
    progress.start("generating")
    detail_lines = []
    for ref, f in fref.items():
        src = src_by_id[f.source_id]
        date = src.published_at.date().isoformat() if src.published_at else "date unknown"
        q = f' Quote: "{f.quote}"' if f.quote else ""
        geo = f" Geography: {f.geographic_scope}." if f.geographic_scope else ""
        detail_lines.append(
            f"{ref} ({f.finding_type}, {f.claim_kind}) from {sref[src.id]} — {src.domain}, {src.source_type}, {date}, "
            f"{'full text' if src.verification_status == 'verified' else 'snippet only'}: {f.statement}{geo}{q}"
        )
    signal_lines = "\n".join(f"- {sig.title}: {sig.description} (findings: {', '.join(ids)})" for sig, ids in signals)

    def check_opps(r: OpportunityResult) -> list[str]:
        problems = []
        for i, o in enumerate(r.opportunities):
            refs = _all_finding_refs(o)
            problems += [f"Opportunity {i + 1}: unknown finding id {x}" for x in refs if x not in fref]
            if not any(e.finding_id in fref for e in o.supporting_evidence):
                problems.append(f"Opportunity {i + 1} has no valid supporting evidence")
        return problems

    result = await llm.structured(
        system=prompts.OPPORTUNITY_SYSTEM,
        prompt=(
            f"Discovery request:\n{request}\n\nResearch interpretation: {plan.interpretation}\n"
            f"Geographic note: {plan.geographic_note}\n\n"
            f"Signals:\n{signal_lines or '(none)'}\n\nFindings (cite by id):\n" + "\n".join(detail_lines)
            + f"\n\nSources analyzed: {len(unique_sources)} from {stats['independent_publishers']} distinct publishers."
        ),
        schema=OpportunityResult,
        tier="smart",
        max_tokens=16000,
        validator=check_opps,
    )

    created = 0
    sig_by_title = {sig.title.lower(): sig for sig, _ in signals}
    for o in result.opportunities:
        opp = _persist_opportunity(db, d, o, fref, sig_by_title, verified_ratio=len(verified) / max(1, len(usable)))
        if opp:
            created += 1
    # Rank by score
    opps = db.scalars(select(Opportunity).where(Opportunity.discovery_id == d.id)).all()
    opps = sorted(opps, key=lambda x: -(x.current_score.overall if x.current_score else 0))
    for i, opp in enumerate(opps):
        opp.rank = i
    stats["opportunities"] = created
    if result.insufficient_evidence_note:
        stats["note"] = result.insufficient_evidence_note
    d.stats = stats
    db.commit()
    progress.done("generating", f"Found {created} opportunit{'y' if created == 1 else 'ies'}")


async def _extract(db: Session, d: Discovery, llm: LLMProvider, request: str, sources: list[ResearchSource]) -> list[Finding]:
    batch_size = 4
    batches = [sources[i : i + batch_size] for i in range(0, len(sources), batch_size)]
    sem = asyncio.Semaphore(3)

    async def run_batch(batch: list[ResearchSource]) -> tuple[dict[str, ResearchSource], ExtractionResult | Exception]:
        refs = {f"S{i + 1}": src for i, src in enumerate(batch)}
        body = "\n\n".join(fence_source(ref, src, 6000) for ref, src in refs.items())

        def check(r: ExtractionResult) -> list[str]:
            return [f"Unknown source ref {f.source_ref}" for f in r.findings if f.source_ref not in refs]

        async with sem:
            try:
                return refs, await llm.structured(
                    system=prompts.EXTRACTOR_SYSTEM,
                    prompt=f"Research request:\n{request}\n\nSources:\n{body}",
                    schema=ExtractionResult,
                    tier="fast",
                    max_tokens=5000,
                    validator=check,
                )
            except LLMError as e:
                return refs, e

    outcomes = await asyncio.gather(*(run_batch(b) for b in batches))
    failures = [o for _, o in outcomes if isinstance(o, Exception)]
    if failures and len(failures) == len(outcomes):
        raise PipelineError(f"Finding extraction failed. {failures[0]}")

    out: list[Finding] = []
    for refs, res in outcomes:
        if isinstance(res, Exception):
            continue
        per_source: dict[str, list[str]] = {}
        for ef in res.findings:
            src = refs[ef.source_ref]
            prior = per_source.setdefault(src.id, [])
            # Drop near-identical findings from the same source (not independent).
            if any(SequenceMatcher(None, ef.statement.lower(), p).ratio() > 0.85 for p in prior):
                continue
            prior.append(ef.statement.lower())
            verified_quote = bool(ef.quote) and quote_in_source(ef.quote or "", src)
            f = Finding(
                discovery_id=d.id,
                source_id=src.id,
                finding_type=ef.finding_type,
                statement=ef.statement.strip(),
                quote=ef.quote.strip() if verified_quote and ef.quote else None,  # unverifiable quotes are discarded
                quote_verified=verified_quote,
                claim_kind=ef.claim_kind,
                geographic_scope=ef.geographic_scope,
                who_affected=ef.who_affected,
            )
            db.add(f)
            out.append(f)
    db.commit()
    return out


def _all_finding_refs(o: GeneratedOpportunity) -> list[str]:
    refs = [e.finding_id for e in o.supporting_evidence + o.contradicting_evidence + o.competitor_evidence]
    for gp in o.evidence_connections + o.why_now + o.claim_breakdown.observed_facts + o.claim_breakdown.source_claims:
        refs += gp.finding_ids
    for a in o.existing_alternatives:
        refs += a.finding_ids
    for r in o.risks:
        refs += r.finding_ids
    return refs


def _ground(points: list[GroundedPoint], fref: dict[str, Finding]) -> list[dict[str, Any]]:
    out = []
    for p in points:
        fs = [fref[x] for x in p.finding_ids if x in fref]
        out.append({"point": p.point, "finding_ids": [f.id for f in fs],
                    "source_ids": list(dict.fromkeys(f.source_id for f in fs))})
    return out


def _persist_opportunity(
    db: Session,
    d: Discovery,
    o: GeneratedOpportunity,
    fref: dict[str, Finding],
    sig_by_title: dict[str, Signal],
    verified_ratio: float,
) -> Opportunity | None:
    def evidence(items, stance):
        rows, seen = [], set()
        for e in items:
            f = fref.get(e.finding_id)
            if f is None or (f.id, stance) in seen:
                continue
            seen.add((f.id, stance))
            rows.append(OpportunityEvidence(source_id=f.source_id, finding_id=f.id, stance=stance,
                                            claim_supported=e.claim_supported, relevance=e.relevance, origin="report"))
        return rows

    supporting = evidence(o.supporting_evidence, "supporting")
    if not supporting:
        return None
    contradicting = evidence(o.contradicting_evidence, "contradicting")
    competitors = evidence(o.competitor_evidence, "competitor")

    def domain(fid: str) -> str:
        return fref_by_id[fid].source.domain

    fref_by_id = {f.id: f for f in fref.values()}
    indep_support = independent_count([domain(e.finding_id) for e in supporting])
    all_domains = [domain(e.finding_id) for e in supporting + contradicting + competitors]

    opp = Opportunity(
        discovery_id=d.id,
        title=o.title,
        summary=o.summary,
        plain_summary=o.plain_summary,
        industry=o.industry,
        location_label=o.location_label,
        geographic_precision=o.geographic_precision,
        geographic_note=o.geographic_note,
        problem=o.problem.model_dump(),
        target_audience=[a.model_dump() for a in o.target_audience],
        evidence_connections=_ground(o.evidence_connections, fref),
        why_now=_ground(o.why_now, fref),
        existing_alternatives=[
            {"name": a.name, "description": a.description,
             "source_ids": list(dict.fromkeys(fref[x].source_id for x in a.finding_ids if x in fref))}
            for a in o.existing_alternatives
        ],
        competition_note=o.competition_note,
        solutions=[s.model_dump() for s in o.solutions],
        risks=[{"risk": r.risk, "severity": r.severity,
                "source_ids": list(dict.fromkeys(fref[x].source_id for x in r.finding_ids if x in fref))} for r in o.risks],
        unknowns=[u.model_dump() for u in o.unknowns],
        validation_steps=o.validation_steps,
        claim_breakdown={
            "observed_facts": _ground(o.claim_breakdown.observed_facts, fref),
            "source_claims": _ground(o.claim_breakdown.source_claims, fref),
            "ai_interpretations": o.claim_breakdown.ai_interpretations,
            "estimates": o.claim_breakdown.estimates,
            "hypotheses": o.claim_breakdown.hypotheses,
        },
        growth_direction=o.growth_direction,
        independent_source_count=independent_count(all_domains),
        supporting_count=indep_support,
        contradicting_count=len(contradicting),
    )
    opp.evidence = supporting + contradicting + competitors
    db.add(opp)
    db.flush()

    dims = {
        k: {"score": getattr(o.scores, k).score, "rationale": getattr(o.scores, k).rationale}
        for k in type(o.scores).model_fields
    }
    sr = compute_score({k: v["score"] for k, v in dims.items()}, indep_support, len(contradicting), o.confidence, verified_ratio)
    db.add(OpportunityScore(
        opportunity_id=opp.id, version=1, overall=sr.overall, raw_overall=sr.raw_overall, dimensions=dims,
        explanation=o.score_explanation, limitations=o.limitations, confidence=sr.confidence,
        confidence_rationale=o.confidence_rationale, cap_reason=sr.cap_reason, reason="initial",
    ))
    linked = {sig_by_title[t.lower()].id for t in o.signal_titles if t.lower() in sig_by_title}
    for sid in linked:
        db.add(OpportunitySignal(opportunity_id=opp.id, signal_id=sid))
    db.flush()
    db.refresh(opp)
    return opp

