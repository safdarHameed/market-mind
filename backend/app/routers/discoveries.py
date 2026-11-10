from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api_schemas import DiscoveryIn
from app.db import get_db
from app.deps import current_user, enforce_discovery_rate, owned_discovery
from app.llm import llm_available
from app.models import Discovery, Opportunity, ResearchSource, User
from app.research.context import build_title
from app.research.pipeline import reset_discovery, run_discovery
from app.ai_config import resolve_search
from app.serializers import discovery_detail, discovery_summary, opportunity_card, source_out

router = APIRouter(prefix="/discoveries", tags=["discoveries"])

_tasks: set[asyncio.Task] = set()


def _launch(discovery_id: str) -> None:
    task = asyncio.create_task(run_discovery(discovery_id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def _require_configured(user_id: str) -> None:
    if not llm_available(user_id):
        raise HTTPException(503, detail={"code": "llm_not_configured",
                                         "message": "Connect an AI provider in Settings to start researching."})
    if resolve_search(user_id) is None:
        raise HTTPException(503, detail={"code": "search_not_configured",
                                         "message": "Connect a search provider in Settings (Tavily, Brave, or Anthropic's built-in web search)."})


@router.post("", status_code=202)
async def create_discovery(body: DiscoveryIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not body.industries and not body.custom_topic and not body.query:
        raise HTTPException(422, "Choose at least one industry, enter a topic, or describe what you want to discover.")
    _require_configured(user.id)
    enforce_discovery_rate(db, user)
    d = Discovery(
        user_id=user.id,
        location=body.location.model_dump(),
        industries=body.industries,
        custom_topic=body.custom_topic,
        discovery_type=body.discovery_type,
        query=body.query,
        filters=body.filters.model_dump(exclude_none=True),
        title=build_title(body.location.model_dump(), body.industries, body.custom_topic, body.discovery_type, body.query),
        status="queued",
    )
    db.add(d)
    db.commit()
    _launch(d.id)
    return {"id": d.id, "status": d.status}


@router.get("")
def list_discoveries(
    limit: int = Query(20, ge=1, le=50),
    before: str | None = Query(None, description="ISO timestamp cursor"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    q = select(Discovery).where(Discovery.user_id == user.id).options(selectinload(Discovery.opportunities))
    if before:
        q = q.where(Discovery.created_at < before)
    rows = db.scalars(q.order_by(Discovery.created_at.desc()).limit(limit + 1)).all()
    items = [discovery_summary(d) for d in rows[:limit]]
    return {"items": items, "next_cursor": items[-1]["created_at"] if len(rows) > limit else None}


@router.get("/featured")
def featured(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """'Discovery of the Day': the highest-scoring opportunity from this user's research in the last 24h."""
    from datetime import timedelta

    from app.models import utcnow

    opps = db.scalars(
        select(Opportunity).join(Discovery).where(
            Discovery.user_id == user.id, Discovery.status == "completed", Discovery.is_demo.is_(False),
            Discovery.completed_at > utcnow() - timedelta(hours=24),
        )
    ).all()
    opps = [o for o in opps if o.current_score]
    if not opps:
        return {"item": None}
    best = max(opps, key=lambda o: (o.current_score.overall, o.supporting_count))
    top_ev = next((ev for ev in best.evidence if ev.stance == "supporting"), None)
    return {"item": opportunity_card(best) | {
        "top_evidence": {"claim": top_ev.claim_supported, "source": source_out(top_ev.source, include_excerpt=False)}
        if top_ev else None,
    }}


@router.get("/{discovery_id}")
def get_discovery(discovery_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return discovery_detail(owned_discovery(db, user, discovery_id))


@router.get("/{discovery_id}/sources")
def get_sources(discovery_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    d = owned_discovery(db, user, discovery_id)
    rows = db.scalars(
        select(ResearchSource).where(ResearchSource.discovery_id == d.id, ResearchSource.origin == "discovery")
        .order_by(ResearchSource.created_at)
    ).all()
    return {"items": [source_out(s) for s in rows]}


@router.post("/{discovery_id}/retry", status_code=202)
async def retry(discovery_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    d = owned_discovery(db, user, discovery_id)
    if d.is_demo:
        raise HTTPException(400, "Demo discoveries can't be re-run.")
    if d.status in ("queued", "running"):
        raise HTTPException(409, "This discovery is already running.")
    _require_configured(user.id)
    enforce_discovery_rate(db, user)
    reset_discovery(db, d)
    _launch(d.id)
    return {"id": d.id, "status": "queued"}


@router.delete("/{discovery_id}", status_code=204)
def delete_discovery(discovery_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    d = owned_discovery(db, user, discovery_id)
    if d.status in ("queued", "running"):
        raise HTTPException(409, "Wait for this discovery to finish before deleting it.")
    db.delete(d)
    db.commit()
