"""Transparent, configurable opportunity scoring.

The LLM rates each dimension 0-10 with a rationale. The overall score is a plain
weighted average computed here (not by the model), then *capped* by evidence
strength so a score can never look more certain than its evidence.

This is an analytical heuristic, not a probability of business success.
"""

from __future__ import annotations

from dataclasses import dataclass

# Dimension key -> (label, weight, description). Weights must sum to 1.0.
DIMENSIONS: dict[str, tuple[str, float, str]] = {
    "demand": ("People want it", 0.20, "Do sources show people actually need this?"),
    "problem_severity": ("How painful the problem is", 0.15, "How much the problem costs or hurts people."),
    "growth_momentum": ("Is it growing?", 0.10, "Is the need increasing? Only rated high with dated numbers."),
    "market_gap": ("Gap in the market", 0.15, "Do current options leave people unhappy?"),
    "competition": ("Room to compete", 0.10, "Higher = fewer competitors. Not finding any doesn’t mean there are none."),
    "feasibility": ("How doable it is", 0.15, "How realistic it is to build and sell."),
    "evidence_quality": ("How solid the sources are", 0.15, "Are the sources independent, recent and direct?"),
}
assert abs(sum(w for _, w, _ in DIMENSIONS.values()) - 1.0) < 1e-9

# Evidence caps: (min independent supporting sources, max overall score)
EVIDENCE_CAPS = [(1, 45), (2, 65), (3, 80)]  # >=4 independent sources: no cap


@dataclass
class ScoreResult:
    overall: int
    raw_overall: float
    confidence: str
    cap_reason: str | None


def compute_score(
    dims: dict[str, int],
    independent_supporting: int,
    contradicting: int,
    model_confidence: str,
    verified_ratio: float,
) -> ScoreResult:
    raw = sum(max(0, min(10, dims.get(k, 0))) * w for k, (_, w, _) in DIMENSIONS.items()) * 10
    overall = raw
    cap_reason = None
    for min_sources, cap in EVIDENCE_CAPS:
        if independent_supporting <= min_sources and overall > cap:
            overall = cap
            cap_reason = (
                f"Kept at {cap} or below because only {independent_supporting} "
                f"source{'s' if independent_supporting != 1 else ''} backed this up."
            )
            break

    # Confidence is the *lower* of the model's view and what the evidence volume allows.
    if independent_supporting >= 4 and verified_ratio >= 0.6:
        evidence_conf = "high"
    elif independent_supporting >= 2:
        evidence_conf = "moderate"
    else:
        evidence_conf = "low"
    order = ["low", "moderate", "high"]
    confidence = min(model_confidence if model_confidence in order else "low", evidence_conf, key=order.index)
    if contradicting >= independent_supporting and confidence == "high":
        confidence = "moderate"

    return ScoreResult(overall=round(overall), raw_overall=round(raw, 1), confidence=confidence, cap_reason=cap_reason)


def evidence_strength(independent_supporting: int, confidence: str) -> str:
    if independent_supporting >= 4 and confidence == "high":
        return "strong"
    if independent_supporting >= 2:
        return "moderate"
    return "limited"


def methodology() -> dict:
    return {
        "dimensions": [
            {"key": k, "label": label, "weight": w, "description": desc} for k, (label, w, desc) in DIMENSIONS.items()
        ],
        "caps": [{"max_independent_sources": n, "max_score": c} for n, c in EVIDENCE_CAPS],
        "note": (
            "The AI rates each part from 0 to 10, based on the sources. "
            "MarketMind combines them into one score, and keeps it low when there are few sources. "
            "It's a guide, not a promise of success."
        ),
    }
