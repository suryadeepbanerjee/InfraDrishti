"""
mcda.py — Canonical Multi-Criteria Decision Analysis engine.

This is the SINGLE source of truth for MCDA scoring in InfraDrishti.
Both the corridor planner and the site finder MUST use these helpers
(rather than re-implementing scoring inline).

Pipeline (per candidate):

    raw metrics
      -> direction (minimise / maximise)
      -> reference-based normalization  n in [0, 1]
      -> weight normalization  (weights sum to 1)
      -> weighted contribution   c = n * w
      -> total score             sum(c)
      -> ranking

Guarantees:
  * weights are validated (numeric, non-negative, known metric names only)
  * weights are normalized by the backend (never trust the frontend)
  * sum(weighted contributions) == final score within floating-point tolerance
"""

from __future__ import annotations

import logging
from typing import Dict, Iterable, Optional

import numpy as np

logger = logging.getLogger(__name__)

TOLERANCE = 1e-9

# Reference maxima used for reference-based (ratio) normalization of each
# metric. A metric value equal to the reference maximum normalizes to 1.0
# (i.e. fully "bad" for a minimisable metric, fully "good" for a maximisable
# metric). These are planning-scale anchors, not hard physical caps.
NORM_REFERENCE = {
    # corridor — anchored at realistic Indian state-level planning scale
    "route_length_km": 150.0,       # 300km was too large; 150km spreads scores on 50-120km corridors
    "mean_slope_deg": 8.0,
    "max_slope_deg": 12.0,
    "water_cell_overlap": 200.0,
    "river_crossings": 150.0,       # was 500; Deccan routes cross ~10-80 rivers
    "forest_overlap_km2": 50.0,     # was 100; Maharashtra forests are patchy
    "cropland_overlap_km2": 80.0,
    "population_exposure": 20000.0,  # was 50000; tighter for rural corridors
    "building_count": 500.0,        # was 1000; 500 buildings/route is already high
    "acquisition_friction_index": 1.0,
    "dist_to_highway_m": 3000.0,    # was 5000; 3km is meaningful proximity
    "dist_to_railway_m": 3000.0,
    "dist_to_power_m": 3000.0,
    # site
    "site_area_ha": 100.0,
    "population_within_1km": 5000.0,
}


def validate_and_merge_weights(
    user_weights: Optional[Dict[str, float]],
    profile_weights: Dict[str, float],
    allowed_metrics: Iterable[str],
) -> Dict[str, float]:
    """Merge user-supplied weights over profile defaults, then normalize.

    Rules:
      * Only known metric names are accepted (from ``allowed_metrics``).
      * Non-numeric or negative values are rejected (ValueError).
      * The result is normalized to sum to 1.0 and returned.
      * ``user_weights=None`` means "use profile defaults".

    Raises ValueError on invalid user input. The API layer turns this into a
    VALIDATION_FAILED response.
    """
    allowed = set(allowed_metrics)
    merged = {k: float(v) for k, v in profile_weights.items() if k in allowed}

    if user_weights:
        for metric, val in user_weights.items():
            if metric not in allowed:
                raise ValueError(f"Unknown MCDA metric: '{metric}'")
            try:
                num = float(val)
            except (TypeError, ValueError):
                raise ValueError(f"MCDA weight for '{metric}' is not numeric: {val!r}")
            if num < 0:
                raise ValueError(f"MCDA weight for '{metric}' must be non-negative, got {num}")
            merged[metric] = num

    total = sum(merged.values())
    if total <= 0:
        raise ValueError("MCDA weights sum to zero; cannot normalize.")

    return {k: float(v / total) for k, v in merged.items()}


def normalize_metric(value: float, ref_value: float, direction: str) -> float:
    """Reference-based ratio normalization.

    value in [0, ref] maps to [0, 1], clipped. For "minimise" the normalized
    value is inverted so that smaller raw values get higher (better) scores.
    """
    if ref_value <= 0:
        return 0.0
    ratio = float(np.clip(value / ref_value, 0.0, 1.0))
    if direction == "minimise":
        return 1.0 - ratio
    if direction == "maximise":
        return ratio
    # Unknown direction -> treat as minimise (conservative default).
    return 1.0 - ratio


def score_candidate(
    raw_metrics: Dict[str, float],
    weights: Dict[str, float],
    directions: Dict[str, str],
    reference: Optional[Dict[str, float]] = None,
) -> Dict:
    """Score a single candidate.

    Returns a dict with:
      total_score, normalized_metrics, weighted_contributions, weights
    """
    reference = reference or NORM_REFERENCE
    norm_metrics: Dict[str, float] = {}
    weighted: Dict[str, float] = {}
    total = 0.0

    for metric, weight in weights.items():
        raw_value = raw_metrics.get(metric, 0.0)
        ref_value = reference.get(metric, 1.0)
        direction = directions.get(metric, "minimise")
        n_val = normalize_metric(float(raw_value), ref_value, direction)
        contrib = float(n_val * weight)
        norm_metrics[metric] = float(n_val)
        weighted[metric] = contrib
        total += contrib

    return {
        "total_score": float(total),
        "normalized_metrics": norm_metrics,
        "weighted_contributions": weighted,
        "weights": dict(weights),
        "math_check": abs(sum(weighted.values()) - total) < TOLERANCE,
    }


def score_and_rank(
    candidates: Iterable[Dict],
    weights: Dict[str, float],
    directions: Dict[str, str],
    reference: Optional[Dict[str, float]] = None,
    metric_passthrough: Optional[Dict[str, str]] = None,
) -> list:
    """Score and rank a list of candidate dicts in-place order.

    Each candidate must already carry a ``raw_metrics`` mapping. This function
    mutates each candidate to add ``mcda_score``, ``normalized_metrics``,
    ``weighted_contributions``, ``weights`` and ``mcda_math_check``, then
    sorts the list by descending score and assigns ``rank``.

    ``metric_passthrough`` optionally maps an MCDA metric name to the raw
    metric key when they differ (e.g. ``{"population_within_1km": "pop_sum_1km_sq_approx"}``).
    """
    metric_passthrough = metric_passthrough or {}

    scored = []
    for cand in candidates:
        raw = cand.get("raw_metrics", cand.get("metrics", {}))
        resolved_raw = {
            metric: raw.get(metric_passthrough.get(metric, metric), 0.0)
            for metric in weights
        }
        result = score_candidate(resolved_raw, weights, directions, reference)
        cand["mcda_score"] = result["total_score"]
        cand["normalized_metrics"] = result["normalized_metrics"]
        cand["weighted_contributions"] = result["weighted_contributions"]
        cand["weights"] = result["weights"]
        cand["mcda_math_check"] = result["math_check"]
        scored.append(cand)

    scored.sort(key=lambda c: c["mcda_score"], reverse=True)
    for idx, c in enumerate(scored):
        c["rank"] = idx + 1

    return scored