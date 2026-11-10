"""Guest identity: a random, httpOnly cookie identifies the browser. No sign-up required.

This is intentionally simple for the MVP; a real auth provider can replace
`current_user` later without touching the routes.
"""

from __future__ import annotations

import re
import uuid
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.db import get_db
from app.models import Conversation, Discovery, Message, Opportunity, User, utcnow

COOKIE = "sh_uid"
_ID_RX = re.compile(r"^[0-9a-f]{32}$")


class GuestCookieMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        uid = request.cookies.get(COOKIE)
        is_new = not (uid and _ID_RX.match(uid))
        if is_new:
            uid = uuid.uuid4().hex
        request.state.uid = uid
        response = await call_next(request)
        if is_new:
            response.set_cookie(
                COOKIE, uid, max_age=60 * 60 * 24 * 365, httponly=True, samesite="lax",
                secure=get_settings().cookie_secure, path="/",
            )
        return response


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    uid = request.state.uid
    user = db.get(User, uid)
    if user is None:
        user = User(id=uid)
        db.add(user)
        db.commit()
    return user


def owned_discovery(db: Session, user: User, discovery_id: str) -> Discovery:
    d = db.get(Discovery, discovery_id)
    if d is None or d.user_id != user.id:
        raise HTTPException(404, "Discovery not found")
    return d


def owned_opportunity(db: Session, user: User, opportunity_id: str) -> Opportunity:
    o = db.get(Opportunity, opportunity_id)
    if o is None or o.discovery.user_id != user.id:
        raise HTTPException(404, "Opportunity not found")
    return o


def owned_conversation(db: Session, user: User, conversation_id: str) -> Conversation:
    c = db.get(Conversation, conversation_id)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return c


def enforce_discovery_rate(db: Session, user: User) -> None:
    limit = get_settings().max_discoveries_per_hour
    n = db.scalar(select(func.count(Discovery.id)).where(
        Discovery.user_id == user.id, Discovery.is_demo.is_(False), Discovery.created_at > utcnow() - timedelta(hours=1)))
    if (n or 0) >= limit:
        raise HTTPException(429, f"You've started {limit} discoveries in the last hour. Please wait before starting more.")


def enforce_message_rate(db: Session, user: User) -> None:
    limit = get_settings().max_chat_messages_per_hour
    n = db.scalar(
        select(func.count(Message.id)).join(Conversation).where(
            Conversation.user_id == user.id, Message.role == "user", Message.created_at > utcnow() - timedelta(hours=1))
    )
    if (n or 0) >= limit:
        raise HTTPException(429, "Message limit reached for this hour. Please wait a bit.")
