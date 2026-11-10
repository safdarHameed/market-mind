"""Clearly-labelled SAMPLE data for UI demonstration when no API keys are configured.

Nothing here is real research. Every source is marked verification_status="sample",
uses a reserved example.org URL, and the discovery is flagged is_demo=True so the UI
shows a persistent "Sample data" banner and disables source links.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import (
    Discovery,
    Finding,
    Opportunity,
    OpportunityEvidence,
    OpportunityScore,
    ResearchSource,
    User,
    utcnow,
)
from app.research.scoring import compute_score

SAMPLE_NOTE = "Sample source for demonstration only — not real research."

SOURCES = [
    ("s1", "Sample: Independent retailers describe inventory headaches", "forum",
     "Owners of small shops discuss over-ordering slow-moving stock and running out of best sellers, and say spreadsheet tracking breaks down during busy seasons."),
    ("s2", "Sample: Small-business software adoption overview", "research",
     "An overview notes that many small retailers rely on point-of-sale systems with basic stock counts but few use forecasting or reorder recommendations."),
    ("s3", "Sample: Review roundup of inventory apps for small shops", "reviews",
     "Reviewers praise several inventory apps for multi-location support but complain that pricing tiers and setup complexity are aimed at larger merchants."),
    ("s4", "Sample: Commentary questioning demand for retail analytics", "blog",
     "A commentator argues that very small retailers rarely pay for analytics add-ons and prefer features bundled into their existing POS."),
    ("s5", "Sample: Rising interest in buy-local marketplaces", "news",
     "A sample article describes neighbourhood shops joining local delivery marketplaces, which adds new channels to keep stock in sync across."),
]

OPPS = [
    {
        "title": "Simple reorder recommendations for independent shops",
        "summary": "Small retailers appear to struggle with over- and under-stocking, while existing inventory tools are described as complex or priced for larger merchants. A lightweight reorder assistant that plugs into common POS systems could fill this gap.",
        "plain": "Small shops often order too much of what doesn't sell and too little of what does. A simple tool that says 'reorder this, skip that' could help.",
        "industry": "E-commerce & Retail",
        "problem": {"what": "Stock decisions are made by gut feel or spreadsheets, leading to dead stock and stock-outs.",
                    "who": "Owners and managers of independent shops with one to three locations.",
                    "why_it_matters": "Tied-up cash in unsold stock and lost sales from stock-outs directly hit thin margins.",
                    "frequency": None},
        "support": [("s1", "Shop owners report over-ordering and stock-outs", "Direct first-hand complaints describing the problem."),
                    ("s2", "Few small retailers use forecasting features", "Suggests the need is not yet met by current tools."),
                    ("s3", "Existing apps are seen as complex/pricey for small shops", "Points to a gap in fit, not absence of products.")],
        "contra": [("s4", "Very small retailers may not pay for analytics add-ons", "Challenges willingness to pay.")],
        "competitor": [("s3", "Several inventory apps already exist", "Shows the space is competitive.")],
        "dims": {"demand": 6, "problem_severity": 6, "growth_momentum": 4, "market_gap": 5, "competition": 4, "feasibility": 7, "evidence_quality": 4},
        "confidence": "low",
    },
    {
        "title": "Unified stock sync for shops selling on local marketplaces",
        "summary": "As neighbourhood shops add local delivery marketplaces, keeping stock levels consistent across channels may become a new operational pain point.",
        "plain": "Shops selling both in-store and on local delivery apps can sell items they no longer have. A tool that keeps counts in sync could help.",
        "industry": "E-commerce & Retail",
        "problem": {"what": "Stock counts drift between the store and online marketplaces.",
                    "who": "Small shops that recently joined local delivery or marketplace platforms.",
                    "why_it_matters": "Overselling leads to cancelled orders and poor ratings on marketplaces.",
                    "frequency": None},
        "support": [("s5", "Shops are joining local delivery marketplaces", "Indicates a behaviour change creating a new need."),
                    ("s1", "Owners already struggle with tracking during busy periods", "Existing pain likely worsens with more channels.")],
        "contra": [],
        "competitor": [],
        "dims": {"demand": 4, "problem_severity": 5, "growth_momentum": 5, "market_gap": 5, "competition": 5, "feasibility": 6, "evidence_quality": 3},
        "confidence": "low",
    },
]


def create_demo_discovery(db: Session, user: User) -> Discovery:
    now = utcnow()
    d = Discovery(
        user_id=user.id, is_demo=True, status="completed", completed_at=now, started_at=now,
        location={"level": "country", "label": "United States", "country": "United States", "country_code": "US"},
        industries=["E-commerce & Retail"], discovery_type="business_opportunities",
        query="What problems are small retailers facing?", filters={"time_period": "1y"},
        title="Sample discovery · Small retailers · United States",
        search_provider="sample", llm_model="sample",
        progress=[{"stage": "sample", "label": "Sample data", "status": "done",
                   "message": "Loaded illustrative sample data (no research was performed)", "at": now.isoformat()}],
        stats={"queries": 0, "results_returned": 0, "unique_urls": len(SOURCES), "verified": 0, "snippet_only": 0,
               "unreachable": 0, "duplicates": 0, "analyzed": len(SOURCES), "independent_publishers": len(SOURCES),
               "findings": len(SOURCES), "signals": 0, "opportunities": len(OPPS),
               "note": "This is sample data for demonstrating the interface. Connect an AI in Settings to run real research."},
    )
    db.add(d)
    db.flush()
    src_rows: dict[str, ResearchSource] = {}
    finding_rows: dict[str, Finding] = {}
    for key, title, stype, text in SOURCES:
        s = ResearchSource(
            discovery_id=d.id, origin="discovery", url=f"https://example.org/signalhunter-sample/{key}",
            canonical_url=f"https://example.org/signalhunter-sample/{key}", title=title, publisher="Sample data",
            domain=f"sample-{key}.example.org", source_type=stype, snippet=text, verification_status="sample",
            verification_note=SAMPLE_NOTE, retrieved_at=now,
        )
        db.add(s)
        db.flush()
        f = Finding(discovery_id=d.id, source_id=s.id, finding_type="business_need", statement=text,
                    claim_kind="source_claim", quote=None, quote_verified=False)
        db.add(f)
        db.flush()
        src_rows[key], finding_rows[key] = s, f

    for rank, spec in enumerate(OPPS):
        ev = []
        for stance, items in (("supporting", spec["support"]), ("contradicting", spec["contra"]), ("competitor", spec["competitor"])):
            for key, claim, rel in items:
                ev.append(OpportunityEvidence(source_id=src_rows[key].id, finding_id=finding_rows[key].id, stance=stance,
                                              claim_supported=claim, relevance=rel, origin="report"))
        support_keys = [k for k, _, _ in spec["support"]]
        o = Opportunity(
            discovery_id=d.id, rank=rank, title=spec["title"], summary=spec["summary"], plain_summary=spec["plain"],
            industry=spec["industry"], location_label="United States", geographic_precision="country",
            geographic_note="Sample data — no geographic evidence was gathered.",
            problem=spec["problem"],
            target_audience=[{"segment": spec["problem"]["who"], "why": "Most directly affected by the problem."}],
            evidence_connections=[{"point": f"{c}", "finding_ids": [finding_rows[k].id], "source_ids": [src_rows[k].id]}
                                  for k, c, _ in spec["support"]],
            why_now=[],
            existing_alternatives=[{"name": "Existing inventory apps (sample)", "description": "Sample placeholder for named competitors found in real research.",
                                    "source_ids": [src_rows["s3"].id]}] if spec["competitor"] else [],
            competition_note="In real research this section discusses named competitors found in sources. Not finding competitors never means none exist.",
            solutions=[{"kind": "saas", "name": "Reorder assistant", "what_it_does": "Reads POS sales history and suggests weekly reorder quantities.",
                        "who_uses_it": "Shop owners", "value_proposition": "Less dead stock, fewer stock-outs, minutes per week.",
                        "revenue_model": "Monthly subscription per location", "mvp": "CSV import from one popular POS + weekly email recommendations."}],
            risks=[{"risk": "Willingness to pay may be low among very small retailers.", "severity": "high",
                    "source_ids": [src_rows["s4"].id]}],
            unknowns=[{"unknown": "Actual willingness to pay", "how_to_validate": "Interview 15 shop owners and test a paid pilot."}],
            validation_steps=["Interview 10–15 independent shop owners", "Prototype with exported POS data", "Run a paid pilot with 3 shops"],
            claim_breakdown={"observed_facts": [], "source_claims": [], "ai_interpretations": ["Sample interpretation."],
                             "estimates": [], "hypotheses": ["Owners would adopt a tool that requires under 10 minutes per week."]},
            growth_direction=None, independent_source_count=len(set(support_keys)),
            supporting_count=len(set(support_keys)), contradicting_count=len(spec["contra"]),
        )
        o.evidence = ev
        db.add(o)
        db.flush()
        sr = compute_score(spec["dims"], len(set(support_keys)), len(spec["contra"]), spec["confidence"], 0.0)
        db.add(OpportunityScore(
            opportunity_id=o.id, version=1, overall=sr.overall, raw_overall=sr.raw_overall,
            dimensions={k: {"score": v, "rationale": "Sample rationale for demonstration."} for k, v in spec["dims"].items()},
            explanation="Sample score for demonstrating the interface.", limitations=["Sample data — no real evidence."],
            confidence=sr.confidence, confidence_rationale="Sample data.", cap_reason=sr.cap_reason, reason="initial",
        ))
    db.commit()
    return d
