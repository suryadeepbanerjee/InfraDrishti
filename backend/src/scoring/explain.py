"""
explain.py — Deterministic, data-driven explanation engine.

Explanations are generated from ACTUAL backend metrics and MCDA
contributions. No hardcoded marketing prose, no LLM, no fabricated facts.

Every comparative statement is derived from measured values, so automated
tests can check factual consistency (e.g. "Route 2 is shorter" is only
emitted when route 2 really has a lower route length).
"""

from __future__ import annotations

from typing import Dict, List, Optional

METRIC_LABELS = {
    "route_length_km": "route length",
    "mean_slope_deg": "mean terrain slope",
    "max_slope_deg": "maximum slope",
    "water_cell_overlap": "water-cell overlap",
    "river_crossings": "river crossings",
    "forest_overlap_km2": "forest overlap",
    "cropland_overlap_km2": "cropland overlap",
    "population_exposure": "population exposure",
    "building_count": "building impact",
    "acquisition_friction_index": "land acquisition friction",
    "dist_to_highway_m": "distance to highway",
    "dist_to_railway_m": "distance to railway",
    "dist_to_power_m": "distance to power grid",
    "site_area_ha": "site area",
    "population_within_1km": "population within 1 km",
    "pop_sum_1km_sq_approx": "population within 1 km (approx)",
}


def _label(metric: str) -> str:
    return METRIC_LABELS.get(metric, metric.replace("_", " "))


def _fmt(value: float, metric: str) -> str:
    if metric in ("acquisition_friction_index",):
        return f"{value:.2f}"
    if metric in ("site_area_ha", "forest_overlap_km2", "cropland_overlap_km2") or abs(value) < 1000:
        return f"{value:.1f}"
    return f"{value:,.0f}"


def build_score_breakdown(
    raw_metrics: Dict[str, float],
    normalized_metrics: Dict[str, float],
    weights: Dict[str, float],
    weighted_contributions: Dict[str, float],
) -> List[Dict]:
    """Return a deterministic score breakdown table (metric -> contribution)."""
    rows = []
    for metric, weight in weights.items():
        rows.append({
            "metric": metric,
            "label": _label(metric),
            "raw_value": raw_metrics.get(metric),
            "normalized_value": round(float(normalized_metrics.get(metric, 0.0)), 4),
            "weight": round(float(weight), 4),
            "contribution": round(float(weighted_contributions.get(metric, 0.0)), 4),
        })
    rows.sort(key=lambda r: r["contribution"], reverse=True)
    return rows


def _relationship(ranked, metric: str) -> Optional[str]:
    """Return a factual comparison string for the top candidate vs the runner-up."""
    if len(ranked) < 2:
        return None
    top = ranked[0].get("raw_metrics", ranked[0].get("metrics", {}))
    second = ranked[1].get("raw_metrics", ranked[1].get("metrics", {}))
    if metric not in top or metric not in second:
        return None
    tv, sv = float(top[metric]), float(second[metric])
    if abs(tv - sv) < 1e-9:
        return None
    better = "lower" if tv < sv else "higher"
    return f"{_label(metric)} is {better} than the next-ranked alternative " \
           f"({_fmt(tv, metric)} vs {_fmt(sv, metric)})"


def generate_candidate_explanation(
    idx: int,
    candidate: Dict,
) -> Dict:
    """Build explanation for a single candidate (route or site).

    ``candidate`` must contain raw_metrics (or metrics), normalized_metrics,
    weights and weighted_contributions.
    """
    raw = candidate.get("raw_metrics", candidate.get("metrics", {}))
    norm = candidate.get("normalized_metrics", {})
    weights = candidate.get("weights", {})
    contrib = candidate.get("weighted_contributions", {})

    breakdown = build_score_breakdown(raw, norm, weights, contrib)

    # Strongest positive factors = highest contributions (best normalised outcomes)
    positive = [r for r in breakdown if r["contribution"] > 0]
    positive.sort(key=lambda r: r["contribution"], reverse=True)
    strongest = positive[:3]

    # Main trade-off = the weakest contributor (lowest normalised score)
    weak = sorted(breakdown, key=lambda r: r["normalized_value"])[:2]

    summary = f"Candidate #{idx + 1} (score {candidate.get('mcda_score', 0.0):.3f})"

    return {
        "summary": summary,
        "score": candidate.get("mcda_score", 0.0),
        "score_breakdown": breakdown,
        "strongest_factors": [
            {
                "metric": r["metric"],
                "label": r["label"],
                "raw_value": r["raw_value"],
                "normalized_value": r["normalized_value"],
                "contribution": r["contribution"],
            }
            for r in strongest
        ],
        "trade_offs": [
            {
                "metric": r["metric"],
                "label": r["label"],
                "raw_value": r["raw_value"],
                "normalized_value": r["normalized_value"],
            }
            for r in weak
        ],
    }


def generate_route_explanation_text(ranked_routes: List[Dict]) -> str:
    """Generate the human-readable explanation text for the top-ranked route.

    Every comparative claim is derived from measured values.
    """
    if not ranked_routes:
        return "No routes were ranked."

    top = ranked_routes[0]
    top_label = top.get("id", "Route 1")
    expl = generate_candidate_explanation(0, top)
    strongest = expl["strongest_factors"]
    tradeoffs = expl["trade_offs"]

    lines: List[str] = []
    lines.append("### WHY THIS ROUTE RANKS HIGHEST")

    if strongest:
        labels = ", ".join(f"{s['label']} (contribution {s['contribution']:.3f})" for s in strongest)
        lines.append(
            f"{top_label} ranks highest because its strongest weighted advantages are {labels}. "
            f"Its final MCDA score is {expl['score']:.3f}."
        )
    else:
        lines.append(f"{top_label} ranks highest with a final MCDA score of {expl['score']:.3f}.")

    # Factual comparisons against alternatives
    comparisons = []
    for metric, _label_name in [("route_length_km", "route length"),
                                ("population_exposure", "population exposure"),
                                ("forest_overlap_km2", "forest overlap"),
                                ("acquisition_friction_index", "acquisition friction")]:
        rel = _relationship(ranked_routes, metric)
        if rel:
            comparisons.append(rel)
    if comparisons:
        lines.append("Comparison against the next-ranked alternative:")
        for c in comparisons:
            lines.append(f"- {c}")

    if tradeoffs:
        tw = ", ".join(f"{t['label']} ({t['raw_value']})" for t in tradeoffs)
        lines.append(f"The primary trade-off for {top_label} is weaker performance on: {tw}.")

    lines.append(
        "Overall planning interpretation: the ranking reflects normalized weighted "
        "criteria; all values above are measured from the computed route geometry "
        "and raster layers, not estimates."
    )
    return "\n\n".join(lines)


def generate_site_explanation_text(ranked_sites: List[Dict]) -> str:
    """Generate the human-readable explanation text for the top-ranked site."""
    if not ranked_sites:
        return "No candidate sites were ranked."

    top = ranked_sites[0]
    expl = generate_candidate_explanation(0, top)
    strongest = expl["strongest_factors"]
    tradeoffs = expl["trade_offs"]

    lines = []
    lines.append("### WHY THIS SITE RANKS HIGHEST")
    if strongest:
        labels = ", ".join(f"{s['label']} (contribution {s['contribution']:.3f})" for s in strongest)
        lines.append(
            f"{top.get('id', 'Site 1')} ranks highest because its strongest weighted "
            f"advantages are {labels}. Its final MCDA score is {expl['score']:.3f}."
        )
    else:
        lines.append(f"{top.get('id', 'Site 1')} ranks highest with an MCDA score of {expl['score']:.3f}.")

    rel = _relationship(ranked_sites, "dist_to_highway_m")
    if rel:
        lines.append(f"Compared with the next-ranked candidate: {rel}.")

    if tradeoffs:
        tw = ", ".join(f"{t['label']} ({t['raw_value']})" for t in tradeoffs)
        lines.append(f"The primary trade-off for this site is weaker performance on: {tw}.")

    lines.append(
        "The candidate is a contiguous planning area (not a legal cadastral parcel), "
        "scored from measured raster/vector-derived metrics."
    )
    return "\n\n".join(lines)