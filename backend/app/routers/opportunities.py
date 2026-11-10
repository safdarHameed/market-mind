from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api_schemas import ConversationIn, MessageIn
from app.chat.service import opportunity_sources, stream_reply
from app.db import SessionLocal, get_db
from app.deps import current_user, enforce_message_rate, owned_conversation, owned_opportunity
from app.llm import LLMError, llm_available
from app.models import Conversation, Opportunity, SavedOpportunity, ShareLink, User, WatchlistItem
from app.research.reassess import reassess
from app.research.scoring import methodology
from app.serializers import conversation_out, opportunity_card, opportunity_report, score_out

router = APIRouter(tags=["opportunities"])


@router.get("/scoring/methodology")
def scoring_methodology():
    return methodology()


@router.get("/opportunities/compare")
def compare(ids: str = Query(..., description="Comma-separated opportunity ids (2-3)"),
            db: Session = Depends(get_db), user: User = Depends(current_user)):
    id_list = [x for x in ids.split(",") if x][:3]
    if len(id_list) < 2:
        raise HTTPException(422, "Choose 2 or 3 opportunities to compare.")
    out = []
    for oid in id_list:
        o = owned_opportunity(db, user, oid)
        out.append(opportunity_card(o) | {
            "score_detail": score_out(o.current_score),
            "risks": o.risks,
            "existing_alternatives": o.existing_alternatives,
            "problem": o.problem,
        })
    return {"items": out}


@router.get("/opportunities/{opportunity_id}")
def get_opportunity(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    saved = db.scalar(select(SavedOpportunity).where(SavedOpportunity.user_id == user.id, SavedOpportunity.opportunity_id == o.id))
    watched = db.scalar(select(WatchlistItem).where(WatchlistItem.user_id == user.id, WatchlistItem.opportunity_id == o.id))
    share = db.scalar(select(ShareLink).where(ShareLink.opportunity_id == o.id))
    siblings = [opportunity_card(x) for x in o.discovery.opportunities if x.id != o.id]
    return opportunity_report(o, opportunity_sources(db, o)) | {
        "is_saved": saved is not None,
        "is_watched": watched is not None,
        "share_token": share.token if share else None,
        "siblings": siblings,
    }


@router.post("/opportunities/{opportunity_id}/reassess")
async def reassess_opportunity(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    if o.discovery.is_demo:
        raise HTTPException(400, "Demo opportunities can't be reassessed.")
    if not llm_available(user.id):
        raise HTTPException(503, "Connect an AI provider in Settings first.")
    try:
        sc = await reassess(db, o)
    except LLMError as e:
        raise HTTPException(502, str(e)) from e
    return {"score": score_out(sc)}


@router.post("/opportunities/{opportunity_id}/share")
def share(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    link = db.scalar(select(ShareLink).where(ShareLink.opportunity_id == o.id))
    if link is None:
        link = ShareLink(opportunity_id=o.id, user_id=user.id)
        db.add(link)
        db.commit()
    return {"token": link.token}


@router.delete("/opportunities/{opportunity_id}/share", status_code=204)
def unshare(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    link = db.scalar(select(ShareLink).where(ShareLink.opportunity_id == o.id))
    if link:
        db.delete(link)
        db.commit()


@router.get("/share/{token}")
def shared_report(token: str, db: Session = Depends(get_db)):
    link = db.get(ShareLink, token)
    if link is None:
        raise HTTPException(404, "This shared report doesn't exist or was unshared.")
    o = db.get(Opportunity, link.opportunity_id)
    return opportunity_report(o, opportunity_sources(db, o), public=True)


# ---------------- Conversations ----------------


@router.get("/opportunities/{opportunity_id}/conversations")
def list_conversations(opportunity_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    rows = db.scalars(select(Conversation).where(Conversation.opportunity_id == o.id, Conversation.user_id == user.id)
                      .order_by(Conversation.updated_at.desc())).all()
    return {"items": [conversation_out(c) for c in rows]}


@router.post("/opportunities/{opportunity_id}/conversations", status_code=201)
def create_conversation(opportunity_id: str, body: ConversationIn, db: Session = Depends(get_db),
                        user: User = Depends(current_user)):
    o = owned_opportunity(db, user, opportunity_id)
    c = Conversation(opportunity_id=o.id, user_id=user.id, title=body.title or "New discussion")
    db.add(c)
    db.commit()
    return conversation_out(c, with_messages=True)


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return conversation_out(owned_conversation(db, user, conversation_id), with_messages=True)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    c = owned_conversation(db, user, conversation_id)
    db.delete(c)
    db.commit()


@router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, body: MessageIn, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    c = owned_conversation(db, user, conversation_id)
    o = db.get(Opportunity, c.opportunity_id)
    if o.discovery.is_demo:
        raise HTTPException(400, "The debate AI isn't available on sample data. Run a real discovery to challenge it.")
    if not llm_available(user.id):
        raise HTTPException(503, "Connect an AI provider in Settings first.")
    enforce_message_rate(db, user)
    conv_id, opp_id = c.id, o.id

    async def gen():
        # Own session: the request-scoped one may close before the stream finishes.
        with SessionLocal() as sdb:
            conv, opp = sdb.get(Conversation, conv_id), sdb.get(Opportunity, opp_id)
            async for chunk in stream_reply(sdb, conv, opp, body.content.strip(), body.mode):
                yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
