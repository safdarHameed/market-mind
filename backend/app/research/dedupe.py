"""Duplicate and syndication detection.

Duplicate coverage must never count as independent confirmation.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Protocol
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

_TRACKING = re.compile(r"^(utm_|fbclid|gclid|mc_|ref$|ref_|cmp$|ocid$|igshid$|si$)", re.I)


def canonicalize_url(url: str) -> str:
    p = urlparse(url.strip())
    host = (p.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m.") or host.startswith("amp."):
        host = host.split(".", 1)[1]
    path = re.sub(r"/(amp|amp\.html)/?$", "/", p.path) or "/"
    path = path.rstrip("/") or "/"
    query = urlencode(sorted((k, v) for k, v in parse_qsl(p.query) if not _TRACKING.match(k)))
    return urlunparse(("https", host, path, "", query, ""))


def domain_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


_SECOND_LEVEL = {"co", "com", "org", "net", "gov", "ac", "edu"}


def root_domain(domain: str) -> str:
    """Registrable-ish domain (news.bbc.co.uk -> bbc.co.uk). Heuristic, no PSL dependency."""
    parts = domain.split(".")
    if len(parts) >= 3 and parts[-2] in _SECOND_LEVEL and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _norm_title(t: str) -> str:
    t = re.sub(r"\s[-|–—]\s[^-|–—]{2,40}$", "", t)  # strip " - Publisher" suffix
    return re.sub(r"\W+", " ", t.lower()).strip()


def _shingles(text: str, k: int = 5) -> set[str]:
    words = re.findall(r"\w+", text.lower())[:600]
    return {" ".join(words[i : i + k]) for i in range(max(0, len(words) - k + 1))}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class SourceLike(Protocol):
    id: str
    title: str
    domain: str
    content_excerpt: str | None
    snippet: str | None
    content_hash: str | None
    duplicate_of_id: str | None
    duplicate_reason: str | None


def mark_duplicates(sources: list[SourceLike]) -> int:
    """Mark later sources that duplicate/syndicate earlier ones. Returns number marked."""
    kept: list[tuple[SourceLike, str, set[str]]] = []
    marked = 0
    for s in sources:
        title = _norm_title(s.title or "")
        sh = _shingles(s.content_excerpt or s.snippet or "")
        dup_of, reason = None, None
        for k, ktitle, ksh in kept:
            if s.content_hash and s.content_hash == k.content_hash:
                dup_of, reason = k, "identical content"
            elif title and len(title) > 25 and SequenceMatcher(None, title, ktitle).ratio() > 0.9:
                dup_of, reason = k, "same headline (likely syndicated)"
            elif len(sh) > 40 and jaccard(sh, ksh) > 0.5:
                dup_of, reason = k, "substantially identical text (syndicated)"
            if dup_of:
                break
        if dup_of:
            s.duplicate_of_id = dup_of.id
            s.duplicate_reason = reason
            marked += 1
        else:
            kept.append((s, title, sh))
    return marked


def independent_count(domains: list[str]) -> int:
    """Independent sources = distinct publishers (several pages from one outlet count once)."""
    return len({root_domain(d) for d in domains if d})
