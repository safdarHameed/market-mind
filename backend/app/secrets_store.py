"""Encryption for user-supplied API keys (Fernet / AES-128-CBC + HMAC).

The encryption key comes from SECRET_KEY, or is generated once into
backend/.secret_key (git-ignored, 0600). Keys are never returned to the client —
only a short hint like "sk-…a1b2".
"""

from __future__ import annotations

import base64
import hashlib
import os
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

_KEY_FILE = Path(__file__).resolve().parent.parent / ".secret_key"


@lru_cache
def _fernet() -> Fernet:
    secret = get_settings().secret_key
    if secret:
        key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    else:
        if not _KEY_FILE.exists():
            _KEY_FILE.write_bytes(Fernet.generate_key())
            os.chmod(_KEY_FILE, 0o600)
        key = _KEY_FILE.read_bytes().strip()
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None  # key rotated / corrupted: treat as not set


def key_hint(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 10:
        return "•" * len(value)
    return f"{value[:3]}…{value[-4:]}"
