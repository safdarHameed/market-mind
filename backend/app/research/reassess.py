"""Re-score an opportunity after debate, optionally classifying newly retrieved sources."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.chat.service import report_context, source_refs
from app.llm import get_llm
from app.models import Conversation, Opportunity, OpportunityEvidence, OpportunityScore
from app.research import prompts
from app.research.ai_schemas import Scores
from app.research.dedupe import independent_count
from app.research.scoring import compute_score


class NewEvidence(BaseModel):
    source_ref: str
    stance: Literal["supporting", "contradicting", "competitor", "context"]
    claim_supported: str
    relevance: str


class ReassessmentOut(BaseModel):
    scores: Scores
    score_explanation: str
    limitations: list[str] = Field(min_length=1)
    confidence: Literal["low", "moderate", "high"]
    confidence_rationale: str
    change_summary: str = Field(description="What changed vs the previous assessment and why. 'No change' if none.")
    new_evidence: list[NewEvidence] = Field(
        default_factory=list, description="Classify sources retrieved during debates (marked as such) that are relevant."
    )


async def reassess(db: Session, opp: Opportunity) -> OpportunityScore:
    llm = get_llm(opp.discovery.user_id)
    refs = source_refs(db, opp)
    debate_refs = {r for r, s in refs.items() if s.origin != "discovery"}
    convs = db.scalars(select(Conversation).where(Conversation.opportunity_id == opp.id)).all()
    transcript = []
    for c in convs:
        for m in c.messages[-30:]:
            if m.status == "complete":
                transcript.append(f"{m.role.upper()}: {m.content[:1500]}")
    prev = opp.current_score

    def check(r: ReassessmentOut) -> list[str]:
        return [f"source_ref {e.source_ref} is not a debate source" for e in r.new_evidence if e.source_ref not in debate_refs]

    out = await llm.structured(
        system=prompts.REASSESS_SYSTEM,
        prompt=(
            report_context(db, opp)
            + f"\n\nDEBATE SOURCES (may be classified in new_evidence): {', '.join(sorted(debate_refs)) or 'none'}"
            + "\n\nDEBATE TRANSCRIPT (user statements are opinions, not evidence):\n"
            + ("\n".join(transcript[-60:]) or "(no debate yet)")
        ),
        schema=ReassessmentOut,
        tier="smart",
        max_tokens=5000,
        validator=check,
    )

    for e in out.new_evidence:
        src = refs[e.source_ref]
        exists = any(ev.source_id == src.id and ev.stance == e.stance for ev in opp.evidence)
        if not exists:
            opp.evidence.append(OpportunityEvidence(source_id=src.id, stance=e.stance, claim_supported=e.claim_supported,
                                                    relevance=e.relevance, origin="debate"))
    db.flush()

    supporting = [ev for ev in opp.evidence if ev.stance == "supporting"]
    contradicting = [ev for ev in opp.evidence if ev.stance == "contradicting"]
    indep = independent_count([ev.source.domain for ev in supporting])
    opp.supporting_count, opp.contradicting_count = indep, len(contradicting)
    opp.independent_source_count = independent_count([ev.source.domain for ev in opp.evidence if ev.stance != "context"])

    dims = {k: {"score": getattr(out.scores, k).score, "rationale": getattr(out.scores, k).rationale}
            for k in type(out.scores).model_fields}
    usable = [s for s in refs.values()]
    verified_ratio = sum(1 for s in usable if s.verification_status == "verified") / max(1, len(usable))
    sr = compute_score({k: v["score"] for k, v in dims.items()}, indep, len(contradicting), out.confidence, verified_ratio)
    score = OpportunityScore(
        opportunity_id=opp.id, version=(prev.version + 1 if prev else 1), overall=sr.overall, raw_overall=sr.raw_overall,
        dimensions=dims, explanation=out.score_explanation, limitations=out.limitations, confidence=sr.confidence,
        confidence_rationale=out.confidence_rationale, cap_reason=sr.cap_reason, reason="reassessment",
        change_summary=out.change_summary,
    )
    db.add(score)
    db.commit()
    db.refresh(opp)
    return score
