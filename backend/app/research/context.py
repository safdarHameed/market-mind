"""Helpers that turn DB records into prompt context. Untrusted text is always fenced."""

from __future__ import annotations

import re
from typing import Any

from app.models import Discovery, ResearchSource
from app.research.fetcher import sanitize_text

DISCOVERY_TYPES = {
    "business_opportunities": ("Business Opportunities", "Ideas someone could build, sell or offer, grounded in evidence of need."),
    "unsolved_problems": ("Unsolved Problems", "Recurring pains and frustrations that existing options don't address well."),
    "market_gaps": ("Market Gaps", "Needs or segments that current products and services underserve."),
    "emerging_trends": ("Emerging Trends", "Shifts in behaviour, technology or regulation that are opening new space."),
}

TIME_PERIOD_DAYS = {"7d": 7, "30d": 30, "3m": 90, "6m": 180, "1y": 365, "any": None}

FILTER_LABELS = {
    "stage": "Opportunity stage",
    "competition": "Preferred competition level",
    "investment": "Investment level",
    "scale": "Business scale",
    "audience": "Audience",
}


def describe_request(d: Discovery) -> str:
    loc = d.location or {}
    dtype, ddesc = DISCOVERY_TYPES.get(d.discovery_type, (d.discovery_type, ""))
    lines = [
        f"Discovery type: {dtype} — {ddesc}",
        f"Location: {loc.get('label', 'Global')} (precision: {loc.get('level', 'global')})",
    ]
    if d.industries:
        lines.append("Industries: " + ", ".join(d.industries))
    if d.custom_topic:
        lines.append(f"Custom topic: {d.custom_topic}")
    if d.query:
        lines.append(f"User's own words: {d.query}")
    f = d.filters or {}
    period = f.get("time_period", "1y")
    lines.append(f"Time period of interest: {period if period != 'any' else 'any time'}")
    for key, label in FILTER_LABELS.items():
        if f.get(key):
            lines.append(f"{label}: {f[key]}")
    return "\n".join(lines)


def build_title(location: dict[str, Any], industries: list[str], custom_topic: str | None, dtype: str, query: str | None) -> str:
    topic = custom_topic or (", ".join(industries[:2]) + (" +" + str(len(industries) - 2) if len(industries) > 2 else "")) or None
    if not topic and query:
        topic = query[:80]
    kind = DISCOVERY_TYPES.get(dtype, (dtype,))[0]
    parts = [kind]
    if topic:
        parts.append(topic)
    parts.append(location.get("label") or "Global")
    return " · ".join(parts)


_TYPE_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("government", re.compile(r"(\.gov(\.[a-z]{2})?$|\.gov\.|\.gob\.|\.gouv\.|\.mil$|europa\.eu$|\.int$|bund\.de$)")),
    ("research", re.compile(r"(arxiv\.org|doi\.org|\.edu$|\.ac\.[a-z]{2}$|researchgate|nature\.com|sciencedirect|springer|ssrn|nber\.org|oecd\.org|worldbank\.org|imf\.org|mckinsey|statista)")),
    ("forum", re.compile(r"(reddit\.com|ycombinator\.com|quora\.com|stackexchange|stackoverflow|discourse|^forum\.|^community\.|producthunt)")),
    ("reviews", re.compile(r"(trustpilot|g2\.com|capterra|play\.google\.com|apps\.apple\.com|getapp|yelp\.)")),
    ("press_release", re.compile(r"(prnewswire|businesswire|globenewswire|einpresswire|accesswire)")),
]


def detect_source_type(domain: str, url: str) -> str:
    for kind, rx in _TYPE_RULES:
        if rx.search(domain):
            return kind
    if re.search(r"/(press|newsroom|press-releases?)/", url):
        return "press_release"
    if re.search(r"/(news|article|articles|story|stories)/|/20\d\d/\d\d/", url):
        return "news"
    if re.search(r"/(blog|insights|posts?)/", url):
        return "blog"
    return "web_page"


def source_text(s: ResearchSource, limit: int) -> str:
    text = s.content_excerpt if s.verification_status == "verified" and s.content_excerpt else (s.snippet or "")
    return sanitize_text(text)[:limit]


def fence_source(ref: str, s: ResearchSource, limit: int) -> str:
    date = s.published_at.date().isoformat() if s.published_at else "unknown"
    access = "full page text" if s.verification_status == "verified" else "search snippet only (page not readable)"
    return (
        f'<untrusted_source ref="{ref}" domain="{s.domain}" published="{date}" type="{s.source_type}" access="{access}">\n'
        f"Title: {sanitize_text(s.title)[:300]}\n"
        f"{source_text(s, limit)}\n"
        f"</untrusted_source>"
    )


def normalize_for_match(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip().lower()


def quote_in_source(quote: str, s: ResearchSource) -> bool:
    if not quote or len(quote) < 12:
        return False
    hay = normalize_for_match((s.content_excerpt or "") + "\n" + (s.snippet or ""))
    return normalize_for_match(quote).strip(" .\"'") in hay
