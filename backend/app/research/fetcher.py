"""Source validation: fetch pages safely and extract only what is actually there.

Safety rules:
- http(s) only, no private / loopback / link-local targets (SSRF protection).
- robots.txt is respected (configurable) — we never bypass site restrictions.
- No cookies, no auth, no CAPTCHA solving; paywalled / blocked pages are recorded as such.
- Response size and time are capped.
- Extracted text is treated as untrusted data downstream.
"""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import re
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from app.config import get_settings

MAX_EXCERPT_CHARS = 12_000


@dataclass
class FetchResult:
    ok: bool
    status: int | None
    final_url: str | None = None
    text: str | None = None
    title: str | None = None
    site_name: str | None = None
    published_at: datetime | None = None
    note: str | None = None


class UnsafeURLError(Exception):
    pass


def _is_public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


async def assert_safe_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UnsafeURLError("Only public http(s) URLs are allowed")
    ok = await asyncio.to_thread(_is_public_host, parsed.hostname)
    if not ok:
        raise UnsafeURLError("URL does not resolve to a public address")


class RobotsCache:
    def __init__(self) -> None:
        self._cache: dict[str, RobotFileParser | None] = {}
        self._lock = asyncio.Lock()

    async def allowed(self, client: httpx.AsyncClient, url: str, user_agent: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        async with self._lock:
            if origin not in self._cache:
                rp: RobotFileParser | None = None
                try:
                    r = await client.get(f"{origin}/robots.txt", timeout=5.0)
                    if r.status_code == 200 and len(r.content) < 500_000:
                        rp = RobotFileParser()
                        rp.parse(r.text.splitlines())
                except httpx.HTTPError:
                    rp = None  # robots.txt unreachable -> treat as no restrictions published
                self._cache[origin] = rp
            rp = self._cache[origin]
        return True if rp is None else rp.can_fetch(user_agent, url)


_DATE_META_KEYS = (
    ("property", "article:published_time"),
    ("name", "article:published_time"),
    ("name", "pubdate"),
    ("name", "publishdate"),
    ("name", "date"),
    ("name", "dc.date"),
    ("name", "DC.date.issued"),
    ("itemprop", "datePublished"),
    ("name", "parsely-pub-date"),
)


def parse_date(value: str | None) -> datetime | None:
    """Parse an absolute date. Relative strings ("2 days ago") are rejected rather than guessed."""
    if not value:
        return None
    value = value.strip()
    if re.search(r"\bago\b|yesterday|today", value, re.I):
        return None
    try:
        dt = dateparser.parse(value, fuzzy=False)
    except (ValueError, OverflowError, TypeError):
        return None
    if dt is None or dt.year < 1990:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if dt > datetime.now(timezone.utc):
        return None
    return dt


def extract_page(html: str) -> tuple[str, str | None, str | None, datetime | None]:
    soup = BeautifulSoup(html, "html.parser")

    title = None
    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        title = str(og["content"]).strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()

    site = soup.find("meta", attrs={"property": "og:site_name"})
    site_name = str(site["content"]).strip() if site and site.get("content") else None

    published = None
    for attr, key in _DATE_META_KEYS:
        tag = soup.find("meta", attrs={attr: key})
        if tag and tag.get("content"):
            published = parse_date(str(tag["content"]))
            if published:
                break
    if not published:
        t = soup.find("time", attrs={"datetime": True})
        if t:
            published = parse_date(str(t["datetime"]))

    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe", "aside"]):
        tag.decompose()
    root = soup.find("article") or soup.find("main") or soup.body or soup
    blocks = []
    for el in root.find_all(["h1", "h2", "h3", "p", "li", "blockquote", "td"]):
        txt = " ".join(el.get_text(" ", strip=True).split())
        if len(txt) >= 40 or el.name in ("h1", "h2", "h3"):
            blocks.append(txt)
    text = "\n".join(dict.fromkeys(blocks))  # de-duplicate repeated blocks, keep order
    return sanitize_text(text)[:MAX_EXCERPT_CHARS], title, site_name, published


_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def sanitize_text(text: str) -> str:
    """Strip control characters and anything that could be confused with our prompt delimiters."""
    text = _CONTROL.sub("", text)
    text = re.sub(r"</?\s*(untrusted_source|system|instructions?)[^>]*>", "", text, flags=re.I)
    return text.strip()


def content_hash(text: str) -> str:
    norm = re.sub(r"\W+", " ", text.lower()).strip()[:4000]
    return hashlib.sha256(norm.encode()).hexdigest()


class PageFetcher:
    def __init__(self) -> None:
        s = get_settings()
        self.settings = s
        self.robots = RobotsCache()
        self.client = httpx.AsyncClient(
            headers={"User-Agent": s.user_agent, "Accept": "text/html,application/xhtml+xml"},
            timeout=s.fetch_timeout_seconds,
            follow_redirects=False,
        )

    async def aclose(self) -> None:
        await self.client.aclose()

    async def fetch(self, url: str) -> FetchResult:
        s = self.settings
        current = url
        try:
            for _ in range(5):  # manual redirects so every hop is SSRF-checked
                await assert_safe_url(current)
                if s.respect_robots_txt and not await self.robots.allowed(self.client, current, s.user_agent):
                    return FetchResult(ok=False, status=None, note="Blocked by the site's robots.txt; not fetched.")
                async with self.client.stream("GET", current) as resp:
                    if resp.is_redirect and resp.headers.get("location"):
                        current = str(resp.url.join(resp.headers["location"]))
                        continue
                    if resp.status_code in (401, 402, 403, 429, 451):
                        return FetchResult(ok=False, status=resp.status_code, final_url=current,
                                           note=f"Site restricted access (HTTP {resp.status_code}).")
                    if resp.status_code >= 400:
                        return FetchResult(ok=False, status=resp.status_code, final_url=current,
                                           note=f"Page returned HTTP {resp.status_code}.")
                    ctype = resp.headers.get("content-type", "")
                    if "html" not in ctype and "text/plain" not in ctype:
                        return FetchResult(ok=False, status=resp.status_code, final_url=current,
                                           note=f"Non-HTML content ({ctype.split(';')[0] or 'unknown'}); text not extracted.")
                    body = bytearray()
                    async for chunk in resp.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > s.fetch_max_bytes:
                            break
                    html = body.decode(resp.encoding or "utf-8", errors="replace")
                    text, title, site, published = extract_page(html)
                    if len(text) < 200:
                        return FetchResult(ok=False, status=resp.status_code, final_url=current, title=title,
                                           site_name=site, published_at=published,
                                           note="Page reachable but little readable text (possibly script-rendered or paywalled).")
                    return FetchResult(ok=True, status=resp.status_code, final_url=current, text=text,
                                       title=title, site_name=site, published_at=published)
            return FetchResult(ok=False, status=None, note="Too many redirects.")
        except UnsafeURLError as e:
            return FetchResult(ok=False, status=None, note=str(e))
        except httpx.TimeoutException:
            return FetchResult(ok=False, status=None, note="Timed out while fetching the page.")
        except httpx.HTTPError as e:
            return FetchResult(ok=False, status=None, note=f"Network error: {type(e).__name__}.")
