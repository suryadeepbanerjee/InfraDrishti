"""
finder.py — Deterministic contiguous site-finder engine.

Required workflow:

    facility type -> real location -> real AOI/data -> suitability mask
    -> hard constraints -> contiguous candidate regions -> dynamic area
       threshold (min_pixels = ceil(required_area_m2 / pixel_area_m2))
    -> real metrics -> canonical MCDA -> deterministic explanation -> GeoJSON

Candidates are genuinely contiguous regions (watershed-segmented). They are
"planning areas", NOT legal cadastral parcels.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Optional

import numpy as np
import rasterio
import yaml
from pyproj import Transformer
from rasterio.features import shapes
from scipy.ndimage import (convolve, distance_transform_edt, label,
                           maximum_filter, uniform_filter)
from shapely.geometry import shape
from shapely.ops import transform as shapely_transform
from skimage.measure import regionprops
from skimage.segmentation import watershed

from src.scoring.mcda import validate_and_merge_weights, score_and_rank
from src.scoring.explain import generate_candidate_explanation, generate_site_explanation_text

logger = logging.getLogger(__name__)

AFI_W_BLDG = 0.30
AFI_W_CROP = 0.50
AFI_BLDG_KERNEL_SIZE = 21  # ~500m square neighbourhood at 50m

PIXEL_AREA_M2 = 50.0 * 50.0

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "configs" / "infrastructure_profiles.yaml"

# Site-specific reference maxima for reference-based normalization.
SITE_REFERENCE = {
    "site_area_ha": 100.0,
    "mean_slope_deg": 10.0,
    "dist_to_highway_m": 5000.0,
    "acquisition_friction_index": 1.0,
    "population_within_1km": 5000.0,
    "building_count": 10.0,
    "dist_to_water_m": 5000.0,
}

# Map MCDA metric name -> raw metric key where they differ.
SITE_METRIC_PASSTHROUGH = {"population_within_1km": "pop_sum_1km_sq_approx"}


def compute_afi_surface(bldg_data, crop_binary):
    if bldg_data is not None:
        bldg_density = uniform_filter((bldg_data > 0).astype(float),
                                      size=AFI_BLDG_KERNEL_SIZE, mode="constant")
    else:
        bldg_density = np.zeros_like(crop_binary)
    return np.clip(AFI_W_BLDG * bldg_density + AFI_W_CROP * crop_binary, 0.0, 1.0)


def run_site_finder(
    req_id: str,
    workspace_manager,
    profile_name: str = "logistics_hub",
    required_area_m2: float = 202343.0,
    user_mcda_weights: Optional[Dict[str, float]] = None,
) -> Dict:
    ws_dir = workspace_manager.processed_dir / "cost_components"

    with open(CONFIG_PATH, "r") as f:
        cfg = yaml.safe_load(f)
    facilities = cfg.get("facilities", {})
    facility = facilities.get(profile_name, facilities.get("logistics_hub", {}))
    if not facility:
        # Fall back to the highway site profile if facility configs are absent.
        facility = cfg["profiles"].get("highway", {})

    profile_weights = facility.get("site_mcda_weights", {})
    directions = facility.get("site_mcda_directions", {})

    def load(filename):
        path = ws_dir / filename
        if path.exists():
            with rasterio.open(path) as src:
                return src.read(1), src.transform, src.crs
        return None, None, None

    dem_data, transform, crs = load("dem.tif")
    if dem_data is None:
        logger.error("DEM missing for site finding!")
        return {"sites": 0, "features": [], "total_candidates_before_filter": 0}

    project_to_wgs84 = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform

    pa_data, _, _ = load("protected_areas.tif")
    w_data, _, _ = load("surface_water.tif")
    wc_data, _, _ = load("worldcover.tif")
    roads_data, _, _ = load("highways.tif")   # distance-to-highway surface
    pop_data, _, _ = load("population.tif")
    bldg_data, _, _ = load("buildings.tif")

    dy, dx = np.gradient(dem_data, 50.0)
    slope_surf = np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))

    if roads_data is not None:
        dist_highway_surf = roads_data.astype(float)
    else:
        dist_highway_surf = None

    if w_data is not None:
        dist_water_surf = distance_transform_edt(w_data == 0) * 50.0
    else:
        dist_water_surf = None

    if pop_data is not None:
        pop_clean = pop_data.astype(float)
        pop_clean[pop_clean < 0] = 0.0
        kernel = np.ones((41, 41), dtype=np.float64)
        pop_sum_surf = convolve(pop_clean, kernel, mode="constant", cval=0.0)
    else:
        pop_sum_surf = None

    crop_binary = (wc_data == 40).astype(np.float32) if wc_data is not None else np.zeros_like(dem_data, dtype=np.float32)
    afi_surf = compute_afi_surface(bldg_data, crop_binary)

    # Hard constraints / suitability mask
    valid_mask = ((dem_data > -9999) & (slope_surf < 10.0)).astype(np.uint8)
    if pa_data is not None:
        valid_mask[pa_data > 0] = 0
    if w_data is not None:
        valid_mask[w_data > 0] = 0
    if wc_data is not None:
        valid_mask[wc_data == 50] = 0   # built-up excluded

    distance = distance_transform_edt(valid_mask)
    local_maxi = maximum_filter(distance, size=10, mode="constant") == distance
    local_maxi[distance == 0] = False
    markers, _ = label(local_maxi)
    labels = watershed(-distance, markers, mask=valid_mask)
    props = regionprops(labels)
    all_count = len(props)

    # Dynamic minimum-area threshold
    min_pixels = int(np.ceil(required_area_m2 / PIXEL_AREA_M2))
    valid_props = [p for p in props if p.area >= min_pixels]

    # Metric availability
    avail_metrics = ["site_area_ha", "mean_slope_deg", "acquisition_friction_index"]
    if dist_highway_surf is not None:
        avail_metrics.append("dist_to_highway_m")
    if dist_water_surf is not None:
        avail_metrics.append("dist_to_water_m")
    if pop_sum_surf is not None:
        avail_metrics.append("population_within_1km")
    if bldg_data is not None:
        avail_metrics.append("building_count")

    mcda_weights = validate_and_merge_weights(user_mcda_weights, profile_weights, avail_metrics)

    candidates = []
    for p in valid_props:
        cr, cc = p.coords[:, 0], p.coords[:, 1]

        raw_metrics = {
            "site_area_ha": float(p.area * PIXEL_AREA_M2 / 10000.0),
            "mean_slope_deg": float(np.mean(slope_surf[cr, cc])),
            "acquisition_friction_index": float(np.mean(afi_surf[cr, cc])),
        }
        if dist_highway_surf is not None:
            centroid_r, centroid_c = int(np.mean(cr)), int(np.mean(cc))
            centroid_r = np.clip(centroid_r, 0, dist_highway_surf.shape[0] - 1)
            centroid_c = np.clip(centroid_c, 0, dist_highway_surf.shape[1] - 1)
            raw_metrics["dist_to_highway_m"] = float(dist_highway_surf[centroid_r, centroid_c])
        if dist_water_surf is not None:
            centroid_r, centroid_c = int(np.mean(cr)), int(np.mean(cc))
            centroid_r = np.clip(centroid_r, 0, dist_water_surf.shape[0] - 1)
            centroid_c = np.clip(centroid_c, 0, dist_water_surf.shape[1] - 1)
            raw_metrics["dist_to_water_m"] = float(dist_water_surf[centroid_r, centroid_c])
        if pop_sum_surf is not None:
            raw_metrics["pop_sum_1km_sq_approx"] = float(np.mean(pop_sum_surf[cr, cc]))
        if bldg_data is not None:
            raw_metrics["building_count"] = float(np.sum(bldg_data[cr, cc]))
        # Transparency metrics
        raw_metrics["cropland_fraction"] = float(np.mean(crop_binary[cr, cc]))
        if pa_data is not None:
            raw_metrics["protected_area_overlap"] = float(np.mean(pa_data[cr, cc] > 0))
        else:
            raw_metrics["protected_area_overlap"] = "Not available"

        candidates.append({
            "raw_metrics": raw_metrics,
            "region": p,
            "labels": labels,
        })

    ranked = score_and_rank(
        candidates,
        mcda_weights,
        directions,
        reference=SITE_REFERENCE,
        metric_passthrough=SITE_METRIC_PASSTHROUGH,
    )

    sites = []
    for idx, cand in enumerate(ranked[:5]):
        p = cand["region"]
        region_mask = (labels == p.label).astype(np.uint8)
        geom = None
        for g, _ in shapes(region_mask, mask=(region_mask > 0), transform=transform):
            geom = g
            break
        if geom is None:
            continue

        geom_shapely = shape(geom)
        geom_wgs84 = shapely_transform(project_to_wgs84, geom_shapely)

        explanation = generate_candidate_explanation(idx, cand)

        raw_metrics = cand["raw_metrics"]
        sites.append({
            "type": "Feature",
            "properties": {
                "request_id": req_id,
                "id": f"SITE-{idx + 1}",
                "rank": idx + 1,
                "mcda_score": float(cand["mcda_score"]),
                "metrics": {k: (round(float(v), 4) if isinstance(v, (int, float)) else v) for k, v in raw_metrics.items()},
                "raw_metrics": raw_metrics,
                "normalized_metrics": cand["normalized_metrics"],
                "weights": cand["weights"],
                "weighted_contributions": cand["weighted_contributions"],
                "mcda_math_check": bool(cand["mcda_math_check"]),
                "explanation": explanation,
                "metric_notes": {
                    "pop_sum_1km_sq_approx": "Mean of summed WorldPop over a 41x41 (~2 km) neighbourhood (approx).",
                    "acquisition_friction_index": "Spatial screening proxy ONLY (not ownership/acquisition probability).",
                    "note": "Candidate is a contiguous planning area, NOT a legal cadastral parcel.",
                },
                "provenance": workspace_manager.manifest.get("provenance", {}),
            },
            "geometry": geom_wgs84.__geo_interface__,
        })

    if sites:
        sites[0]["properties"]["explanation"]["text"] = generate_site_explanation_text(
            [s["properties"] for s in sites]
        )

    return {
        "sites": len(sites),
        "total_candidates_before_filter": all_count,
        "total_candidates_after_size_filter": len(valid_props),
        "min_pixels": min_pixels,
        "features": sites,
    }