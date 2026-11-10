import pytest

from app.llm.jsonschema import inline_schema
from app.research.ai_schemas import OpportunityResult
from app.research.dedupe import canonicalize_url, independent_count, root_domain
from app.research.fetcher import UnsafeURLError, assert_safe_url, extract_page, parse_date
from app.research.scoring import compute_score


def test_canonicalize_strips_tracking_and_www():
    assert canonicalize_url("http://www.x.com/a/?utm_source=t&id=2#frag") == canonicalize_url("https://x.com/a?id=2")


def test_root_domain_and_independence():
    assert root_domain("news.bbc.co.uk") == "bbc.co.uk"
    assert independent_count(["a.com", "blog.a.com", "b.org"]) == 2


def test_parse_date_rejects_relative_and_future():
    assert parse_date("2 days ago") is None
    assert parse_date("2999-01-01") is None
    assert parse_date("2025-04-30T10:00:00Z").year == 2025
    assert parse_date(None) is None


def test_extract_page_metadata():
    html = """<html><head><title>T</title><meta property="og:site_name" content="Pub">
    <meta property="article:published_time" content="2025-02-03T00:00:00Z"></head>
    <body><script>evil()</script><article><p>""" + ("Real paragraph text here. " * 10) + "</p></article></body></html>"
    text, title, site, published = extract_page(html)
    assert title == "T" and site == "Pub" and published.year == 2025
    assert "evil" not in text and "Real paragraph" in text


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["http://localhost/x", "http://127.0.0.1/", "file:///etc/passwd", "http://10.0.0.1/"])
async def test_ssrf_blocked(url):
    with pytest.raises(UnsafeURLError):
        await assert_safe_url(url)


def test_score_caps_and_confidence():
    dims = {k: 10 for k in ["demand", "problem_severity", "growth_momentum", "market_gap", "competition", "feasibility", "evidence_quality"]}
    r = compute_score(dims, independent_supporting=2, contradicting=0, model_confidence="high", verified_ratio=1.0)
    assert r.raw_overall == 100 and r.overall == 65 and r.confidence == "moderate"
    r = compute_score(dims, 5, 0, "high", 1.0)
    assert r.overall == 100 and r.cap_reason is None and r.confidence == "high"
    r = compute_score(dims, 5, 6, "high", 1.0)
    assert r.confidence == "moderate"


def test_inline_schema_keeps_title_property_and_has_no_refs():
    s = inline_schema(OpportunityResult)
    assert "$ref" not in str(s)
    opp = s["properties"]["opportunities"]["items"]
    assert "title" in opp["properties"]
