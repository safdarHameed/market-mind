"""Saved, Watchlist, profile, config status and demo data."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api_schemas import ProfileIn, WatchIn
from app.config import get_settings
from app.db import get_db
from app.deps import current_user, owned_opportunity
from app.ai_config import resolve_ai, resolve_search
from app.models import Conversation, Discovery, Opportunity, SavedOpportunity, User, WatchlistItem
from app.serializers import iso, opportunity_card

router = APIRouter(tags=["library"])


@router.get("/config")
def config_status(user: User = Depends(current_user)):
    s = get_settings()
    ai = resolve_ai(user.id)
    search = resolve_search(user.id, ai)
    return {
        "llm_configured": ai is not None,
        "llm_provider": ai.label if ai else None,
        "llm_model": ai.model_smart if ai else None,
        "llm_source": ai.source if ai else None,
        "search_provider": search.provider if search else None,
        "search_provider_label": search.label if search else None,
        "research_ready": bool(ai and search),
        "limits": {"max_sources": s.research_max_sources, "max_queries": s.research_max_queries,
                   "respect_robots_txt": s.respect_robots_txt},
    }


# ---------------- Saved ----------------


def _score(o: Opportunity) -> int | None:
    return o.current_score.overall if o.current_score else None


@router.get("/saved")
def list_saved(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(SavedOpportunity).where(SavedOpportunity.user_id == user.id)
                      .order_by(SavedOpportunity.created_at.desc())).all()
    out = []
    for r in rows:
        conv_count = db.scalar(select(func.count(Conversation.id)).where(
            Conversation.opportunity_id == r.opportunity_id, Conversation.user_id == user.id))
        out.append({"saved_at": iso(r.created_at), "score_at_save": r.score_at_save,
                    "conversation_count": conv_count or 0, "opportunity": opportunity_card(r.opportunity)})
    return {"items": out}


@router.put("/saved/{opportunity_id}")
def save(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    existing = db.scalar(select(SavedOpportunity).where(SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id == o.id))
    if existing is None:
        db.add(SavedOpportunity(user_id=user.id, opportunity_id=o.id, score_at_save=_score(o)))
        db.commit()
    return {"saved": True}


@router.delete("/saved/{opportunity_id}")
def unsave(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.execute(delete(SavedOpportunity).where(SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id == opportunity_id))
    db.commit()
    return {"saved": False}


# ---------------- Watchlist ----------------


@router.get("/watchlist")
def list_watch(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(WatchlistItem).where(WatchlistItem.user_id == user.id)
                      .order_by(WatchlistItem.created_at.desc())).all()
    return {"items": [{"added_at": iso(r.created_at), "score_at_add": r.score_at_add, "note": r.note,
                       "current_score": _score(r.opportunity), "opportunity": opportunity_card(r.opportunity)} for r in rows]}


@router.put("/watchlist/{opportunity_id}")
def watch(opportunity_id: str, body: WatchIn | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    item = db.scalar(select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.opportunity_id == o.id))
    if item is None:
        item = WatchlistItem(user_id=user.id, opportunity_id=o.id, score_at_add=_score(o))
        db.add(item)
    if body and body.note is not None:
        item.note = body.note
    db.commit()
    return {"watched": True}


@router.delete("/watchlist/{opportunity_id}")
def unwatch(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.execute(delete(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.opportunity_id == opportunity_id))
    db.commit()
    return {"watched": False}


# ---------------- Profile ----------------


@router.get("/me")
def me(db: Session = Depends(get_db), user: User = Depends(current_user)):
    counts = {
        "discoveries": db.scalar(select(func.count(Discovery.id)).where(Discovery.user_id == user.id)) or 0,
        "saved": db.scalar(select(func.count(SavedOpportunity.id)).where(SavedOpportunity.user_id == user.id)) or 0,
        "watchlist": db.scalar(select(func.count(WatchlistItem.id)).where(WatchlistItem.user_id == user.id)) or 0,
        "conversations": db.scalar(select(func.count(Conversation.id)).where(Conversation.user_id == user.id)) or 0,
    }
    return {"id": user.id, "display_name": user.display_name, "home_country": user.home_country,
            "created_at": iso(user.created_at), "is_guest": True, "counts": counts}


@router.patch("/me")
def update_me(body: ProfileIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(user, k, (v or "").strip() or None)
    db.commit()
    return {"ok": True}


@router.delete("/me/data", status_code=204)
def delete_my_data(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if db.scalar(select(func.count(Discovery.id)).where(Discovery.user_id == user.id, Discovery.status.in_(("queued", "running")))):
        raise HTTPException(409, "Wait for running discoveries to finish first.")
    db.delete(user)
    db.commit()


# ---------------- Demo ----------------


@router.post("/demo", status_code=201)
def create_demo(db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.demo import create_demo_discovery

    existing = db.scalar(select(Discovery).where(Discovery.user_id == user.id, Discovery.is_demo.is_(True)))
    if existing:
        return {"id": existing.id}
    d = create_demo_discovery(db, user)
    return {"id": d.id}
