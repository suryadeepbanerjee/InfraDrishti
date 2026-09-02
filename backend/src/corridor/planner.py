"""
planner.py — Deterministic least-cost corridor engine.

Real geospatial computation:
  * real origin/destination (lon/lat -> projected CRS -> raster cell)
  * real cost surface (slope, protected areas, water, roads, land cover,
    population, buildings) + MCP_Geometric least-cost pathing
  * real route geometry (projected LineString, true length)
  * real metrics + canonical MCDA + deterministic explanation

No OSRM for proposed-corridor generation. No fabricated alternatives.
The user-requested ``n_routes`` is honoured; alternative routes are generated
by masking previously used cells (spatial diversity).
"""

from __future__ import annotations

import itertools
import logging
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import rasterio
import yaml
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt, uniform_filter
from shapely.geometry import LineString
from shapely.ops import transform as shapely_transform
from skimage.graph import MCP_Geometric

from src.scoring.mcda import NORM_REFERENCE, validate_and_merge_weights, score_candidate
from src.scoring.explain import generate_candidate_explanation, generate_route_explanation_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ACQUISITION FRICTION INDEX (AFI) — SHARED DEFINITION
# ---------------------------------------------------------------------------
AFI_W_BLDG = 0.30
AFI_W_CROP = 0.50
AFI_BLDG_KERN = 21   # ~500m square neighbourhood at 50m

DIVERSITY_JACCARD_THRESHOLD = 0.20
PIXEL_AREA_M2 = 50.0 * 50.0
DIVERSITY_MASK_RADIUS = 15          # cells (~750m) — forces distinct corridors without blocking feasibility
DIVERSITY_MIN_PATH_CELLS = 50       # only mask on non-trivial paths
DIVERSITY_TERMINAL_MARGIN = 60      # cells (3 km) — terminal convergence zones left unmasked so the next
                                    # MCP solve can still connect the same fixed start/end cells via a
                                    # genuinely different corridor.

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "configs" / "infrastructure_profiles.yaml"


def _apply_user_emphasis_to_cost_weights(
    cost_weights: Dict[str, float],
    user_mcda_weights: Optional[Dict[str, float]],
) -> Dict[str, float]:
    """Blend profile cost_weights with the user's MCDA emphasis.

    The UI exposes three sliders (terrain / land_cost / ecological) which map
    to ``mcda_weights`` keys.  This function converts that user emphasis into
    adjustments on the ``cost_weights`` used to BUILD the MCP cost surface,
    so the slider values actually change which paths are traced — not just how
    the already-found paths are ranked.

    Mapping:
        mean_slope_deg                   → slope_cost
        acquisition_friction_index       → acquisition_friction_index + building_density (shared)
        forest_overlap_km2 / population  → land_cover_cost + population_exposure (shared)

    Blending strategy: 50 % profile baseline + 50 % user signal (clamped to
    [0.01, 2.0]).  This keeps the profile's engineering rationale intact while
    making the cost surface genuinely responsive.
    """
    if not user_mcda_weights:
        return cost_weights

    overrides = dict(cost_weights)  # shallow copy so original profile is unchanged

    # --- terrain slider → slope sensitivity --------------------------------
    u_slope = float(user_mcda_weights.get("mean_slope_deg", 0.0))
    if u_slope > 0:
        base = overrides.get("slope_cost", 0.20)
        overrides["slope_cost"] = float(np.clip(0.50 * base + 0.50 * u_slope * 2.0, 0.01, 2.0))

    # --- land-cost slider → acquisition friction + building density --------
    u_afi = float(user_mcda_weights.get("acquisition_friction_index", 0.0))
    if u_afi > 0:
        base_afi = overrides.get("acquisition_friction_index", 0.20)
        overrides["acquisition_friction_index"] = float(np.clip(0.50 * base_afi + 0.50 * u_afi * 2.0, 0.01, 2.0))
        base_bldg = overrides.get("building_density", 0.15)
        overrides["building_density"] = float(np.clip(0.50 * base_bldg + 0.50 * u_afi * 2.0, 0.01, 2.0))

    # --- ecological slider → land cover + population -----------------------
    u_forest = float(user_mcda_weights.get("forest_overlap_km2", 0.0))
    u_pop = float(user_mcda_weights.get("population_exposure", 0.0))
    u_eco = max(u_forest, u_pop)  # take the stronger ecological signal
    if u_eco > 0:
        base_lc = overrides.get("land_cover_cost", 0.15)
        overrides["land_cover_cost"] = float(np.clip(0.50 * base_lc + 0.50 * u_eco * 2.0, 0.01, 2.0))
        base_pop = overrides.get("population_exposure", 0.10)
        overrides["population_exposure"] = float(np.clip(0.50 * base_pop + 0.50 * u_pop * 2.0, 0.01, 2.0))

    logger.info("Cost-surface weights after user emphasis blend: %s", overrides)
    return overrides


def compute_afi_surface(bldg_data, crop_binary):
    """Raster-wide AFI surface [0,1]. Shared with the site finder."""
    if bldg_data is not None:
        bldg_density = uniform_filter(
            (bldg_data > 0).astype(float), size=AFI_BLDG_KERN, mode="constant"
        )
    else:
        bldg_density = np.zeros_like(crop_binary)
    return np.clip(AFI_W_BLDG * bldg_density + AFI_W_CROP * crop_binary, 0.0, 1.0)


def _read(ws_dir, filename):
    path = ws_dir / filename
    if path.exists():
        with rasterio.open(path) as src:
            return src.read(1)
    return None


def _point_to_cell(transform, crs, lon, lat, shape):
    """Convert a WGS84 point to the nearest raster cell, without clamping.

    Returns (r, c, error_m) where error_m is the distance between the requested
    point and the centre of the returned cell. Raises ValueError if the point
    is outside the grid (coverage).
    """
    rows, cols = shape
    to_proj = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    x, y = to_proj.transform(lon, lat)
    r, c = rasterio.transform.rowcol(transform, x, y)
    ri, ci = int(round(r)), int(round(c))
    if not (0 <= ri < rows and 0 <= ci < cols):
        raise ValueError(
            f"Endpoint ({lon:.5f},{lat:.5f}) is outside the processing grid "
            f"(rows {rows}, cols {cols})."
        )
    cx, cy = rasterio.transform.xy(transform, ri + 0.5, ci + 0.5)
    error_m = math.hypot(cx - x, cy - y)
    return ri, ci, error_m


def _snap_to_valid(cost_surface, r, c):
    """Snap a start/end cell to the nearest finite-cost cell (if needed).

    Returns (r, c, extra_buffer_m). The buffer records the distance moved so it
    can be added to the endpoint error (never silently substituted).
    """
    if np.isfinite(cost_surface[r, c]):
        return r, c, 0.0
    finite = np.isfinite(cost_surface)
    if not finite.any():
        return r, c, 0.0
    dist, (rr, cc) = distance_transform_edt(~finite, return_indices=True)
    r1, c1 = int(rr[r, c]), int(cc[r, c])
    extra = math.hypot((r1 - r) * 50.0, (c1 - c) * 50.0)
    logger.info("Endpoint (%d,%d) was a hard-constraint cell; snapped to (%d,%d) (%+.0fm).", r, c, r1, c1, extra)
    return r1, c1, extra


def run_corridor_planner(
    req_id: str,
    workspace_manager,
    profile_name: str = "highway",
    origin_lonlat: Optional[Tuple[float, float]] = None,
    dest_lonlat: Optional[Tuple[float, float]] = None,
    n_routes: int = 5,
    user_mcda_weights: Optional[Dict[str, float]] = None,
) -> Dict:
    ws_dir = workspace_manager.processed_dir / "cost_components"

    with open(CONFIG_PATH, "r") as f:
        profiles = yaml.safe_load(f)["profiles"]
    profile = profiles[profile_name]
    # Blend profile cost_weights with user MCDA emphasis so the MCP cost
    # surface itself responds to the UI sliders (not just the ranking).
    cost_weights = _apply_user_emphasis_to_cost_weights(
        profile["cost_weights"], user_mcda_weights
    )
    profile_mcda_weights = profile["mcda_weights"]
    mcda_directions = profile["mcda_directions"]

    dem_path = ws_dir / "dem.tif"
    if not dem_path.exists():
        logger.error("DEM missing for route planning!")
        return {"routes": 0, "features": [], "failed_attempts": ["DEM missing"]}

    with rasterio.open(dem_path) as src:
        dem_data = src.read(1).astype(float)
        transform = src.transform
        crs = src.crs

    project_to_wgs84 = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform

    # ---- Build hard-constraint + cost surface ----------------------------
    cost_surface = np.ones_like(dem_data)

    dy, dx = np.gradient(dem_data, 50.0)
    slope = np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))
    cost_surface += slope * cost_weights.get("slope_cost", 0.20) * 10.0

    pa_data = _read(ws_dir, "protected_areas.tif")
    if pa_data is not None:
        cost_surface[pa_data > 0] = np.inf

    w_data = _read(ws_dir, "surface_water.tif")
    if w_data is not None:
        cost_surface[w_data > 0] += 50.0

    roads_data = _read(ws_dir, "highways.tif")  # distance-to-highway surface
    if roads_data is not None:
        # Minor tie-in preference for staying near existing roads.
        cost_surface[roads_data > 0] += 5.0 * cost_weights.get("dist_to_highway_inverse", 0.10)

    wc_data = _read(ws_dir, "worldcover.tif")  # ESA WorldCover classes
    if wc_data is not None:
        cost_surface[wc_data == 10] += 20.0 * cost_weights.get("land_cover_cost", 0.15)

    pop_data = _read(ws_dir, "population.tif")
    if pop_data is not None:
        pop_clean = pop_data.astype(float)
        pop_clean[pop_clean < 0] = 0.0
        cost_surface[pop_clean > 0] += (
            np.log1p(pop_clean[pop_clean > 0]) * 5.0 * cost_weights.get("population_exposure", 0.10)
        )

    bldg_data = _read(ws_dir, "buildings.tif")
    if bldg_data is not None:
        cost_surface[bldg_data > 0] += 100.0 * cost_weights.get("building_density", 0.15)

    rivers_data = _read(ws_dir, "rivers.tif")

    cost_surface[cost_surface < 1] = 1.0

    crop_binary = (wc_data == 40).astype(np.float32) if wc_data is not None else np.zeros_like(dem_data, dtype=np.float32)
    afi_surf = compute_afi_surface(bldg_data, crop_binary)

    # ---- Endpoint resolution ---------------------------------------------
    if origin_lonlat is None or dest_lonlat is None:
        raise ValueError("origin and destination coordinates are required")

    start_r, start_c, origin_base_err = _point_to_cell(transform, crs, origin_lonlat[0], origin_lonlat[1], cost_surface.shape)
    end_r, end_c, dest_base_err = _point_to_cell(transform, crs, dest_lonlat[0], dest_lonlat[1], cost_surface.shape)

    start_r, start_c, origin_snap = _snap_to_valid(cost_surface, start_r, start_c)
    end_r, end_c, dest_snap = _snap_to_valid(cost_surface, end_r, end_c)

    origin_error_m = origin_base_err + origin_snap
    destination_error_m = dest_base_err + dest_snap
    logger.info("Origin cell (%d,%d) err=%.1fm | Dest cell (%d,%d) err=%.1fm",
                start_r, start_c, origin_error_m, end_r, end_c, destination_error_m)

    start_idx = (start_r, start_c)
    end_idx = (end_r, end_c)

    # ---- MCDA metric availability ----------------------------------------
    # All corridor metrics are computed from actual rasters. Which are present?
    avail_metrics = ["route_length_km", "mean_slope_deg", "acquisition_friction_index"]
    if rivers_data is not None:
        avail_metrics.append("river_crossings")
    if wc_data is not None:
        avail_metrics.extend(["forest_overlap_km2", "cropland_overlap_km2"])
    if pop_data is not None:
        avail_metrics.append("population_exposure")
    if bldg_data is not None:
        avail_metrics.append("building_count")
    if roads_data is not None:
        avail_metrics.append("dist_to_highway_m")
    if slope is not None:
        avail_metrics.append("max_slope_deg")

    mcda_weights = validate_and_merge_weights(user_mcda_weights, profile_mcda_weights, avail_metrics)

    n_attempts = max(1, min(int(n_routes), 10))
    routes: List[Dict] = []
    fail_reasons: List[str] = []
    cost_work = cost_surface.copy()

    for i in range(n_attempts):
        mcp = MCP_Geometric(cost_work)
        try:
            _, _ = mcp.find_costs([start_idx])
            path = mcp.traceback(end_idx)
        except Exception as e:
            msg = (
                f"Route {i + 1}: no minimum-cost path to endpoint. "
                f"Cause: {e}. Prior buffer masks have blocked all viable cell chains."
            )
            logger.warning(msg)
            fail_reasons.append(msg)
            break

        coords = []
        path_slope = []
        water_cells = 0
        river_cells = 0
        forest_cells = 0
        crop_cells = 0
        pop_exposure = 0.0
        bldg_count = 0
        afi_vals = []
        dist_hw_vals = []
        max_slope_val = 0.0

        for r, c in path:
            x, y = rasterio.transform.xy(transform, r, c)
            coords.append((x, y))
            s = float(slope[r, c])
            path_slope.append(s)
            if s > max_slope_val:
                max_slope_val = s
            if w_data is not None and w_data[r, c] > 0:
                water_cells += 1
            if rivers_data is not None and rivers_data[r, c] > 0:
                river_cells += 1
            if wc_data is not None and wc_data[r, c] == 10:
                forest_cells += 1
            if wc_data is not None and wc_data[r, c] == 40:
                crop_cells += 1
            if pop_data is not None and pop_data[r, c] > 0:
                pop_exposure += max(0.0, float(pop_data[r, c]))
            if bldg_data is not None and bldg_data[r, c] > 0:
                bldg_count += 1
            if roads_data is not None:
                dist_hw_vals.append(float(roads_data[r, c]))
            afi_vals.append(float(afi_surf[r, c]))

        geom_shapely = LineString(coords)
        length_km = float(geom_shapely.length / 1000.0)  # true projected length

        raw_metrics = {
            "route_length_km": length_km,
            "mean_slope_deg": float(np.mean(path_slope)),
            "max_slope_deg": float(max_slope_val),
            "acquisition_friction_index": float(np.mean(afi_vals)) if afi_vals else 0.0,
        }
        if rivers_data is not None:
            raw_metrics["river_crossings"] = float(river_cells)
        if wc_data is not None:
            raw_metrics["forest_overlap_km2"] = float(forest_cells * PIXEL_AREA_M2 / 1e6)
            raw_metrics["cropland_overlap_km2"] = float(crop_cells * PIXEL_AREA_M2 / 1e6)
        if pop_data is not None:
            raw_metrics["population_exposure"] = float(pop_exposure)
        if bldg_data is not None:
            raw_metrics["building_count"] = float(bldg_count)
        if roads_data is not None:
            raw_metrics["dist_to_highway_m"] = float(np.mean(dist_hw_vals)) if dist_hw_vals else None

        # Non-scored transparency metric (water occurrence overlap)
        raw_metrics["water_cell_overlap"] = float(water_cells)

        scoring = score_candidate(raw_metrics, mcda_weights, mcda_directions, NORM_REFERENCE)

        geom_wgs84 = shapely_transform(project_to_wgs84, geom_shapely)

        routes.append({
            "type": "Feature",
            "properties": {
                "request_id": req_id,
                "id": f"R-{i + 1}",
                "rank": i + 1,
                "mcda_score": scoring["total_score"],
                "metrics": {k: (v if v is not None else "Not available") for k, v in raw_metrics.items()},
                "raw_metrics": raw_metrics,
                "normalized_metrics": scoring["normalized_metrics"],
                "weights": scoring["weights"],
                "weighted_contributions": scoring["weighted_contributions"],
                "mcda_math_check": scoring["math_check"],
                "origin_error_m": round(origin_error_m, 2),
                "destination_error_m": round(destination_error_m, 2),
                "afi_note": (
                    "acquisition_friction_index = mean per-cell AFI along the route. "
                    "AFI = clip(0.30*local_building_density + 0.50*cropland_presence, 0, 1). "
                    "This is a spatial screening proxy — NOT ownership/acquisition probability."
                ),
                "metric_notes": {
                    "river_crossings": "Number of 50m route cells intersecting the rasterized river network.",
                    "water_cell_overlap": "Number of 50m route cells overlapping surface-water occurrence (not shown as 'crossings').",
                },
                "provenance": workspace_manager.manifest.get("provenance", {}),
            },
            "geometry": {"type": "LineString", "coordinates": list(geom_wgs84.coords)},
            "_geom": geom_shapely,
        })

        # Mask used cells to force spatially distinct alternatives.
        # Leave terminal convergence zones (start/end) unmasked so the next
        # MCP solve can still connect the same fixed start/end cells via a
        # genuinely different corridor.
        if len(path) >= DIVERSITY_MIN_PATH_CELLS and i + 1 < n_attempts:
            R = DIVERSITY_MASK_RADIUS
            margin = DIVERSITY_TERMINAL_MARGIN
            interior = path[margin:-margin] if len(path) > 2 * margin else path[margin:]
            for r, c in interior:
                rmin = max(0, r - R)
                rmax = min(cost_work.shape[0], r + R + 1)
                cmin = max(0, c - R)
                cmax = min(cost_work.shape[1], c + R + 1)
                cost_work[rmin:rmax, cmin:cmax] = np.inf

    # ---- Cross-route relative rescaling -----------------------------------------
    # The reference-based absolute score (0-1) is kept for provenance, but for
    # display we also compute a relative score that spans the actual spread of
    # scored candidates.  This ensures routes that are genuinely different show
    # different numbers even when all fall in a narrow absolute band.
    abs_scores = [r["properties"]["mcda_score"] for r in routes]
    s_min, s_max = min(abs_scores), max(abs_scores)
    spread = s_max - s_min
    for r in routes:
        a = r["properties"]["mcda_score"]
        # Relative score: best route = 1.0, others proportional to spread.
        # When all routes are identical (spread==0) every route scores 1.0.
        if spread > 1e-9:
            rel = 0.50 + 0.50 * (a - s_min) / spread   # map [s_min, s_max] -> [0.5, 1.0]
        else:
            rel = 1.0
        r["properties"]["mcda_score_relative"] = float(round(rel, 4))
        r["properties"]["mcda_score_absolute"] = float(round(a, 4))

    # Rank by absolute score (descending), assign stable ranks
    routes.sort(key=lambda x: x["properties"]["mcda_score"], reverse=True)

    # Diversity metrics (buffered Jaccard overlap)
    diversity_metrics = []
    buffered = [(r["_geom"].buffer(500.0), r["properties"]["id"]) for r in routes]
    for (p1, id1), (p2, id2) in itertools.combinations(buffered, 2):
        inter = p1.intersection(p2).area
        union = p1.union(p2).area
        jac = float(inter / union) if union > 0 else 0.0
        diversity_metrics.append({
            "pair": [id1, id2],
            "jaccard_overlap": round(jac, 4),
            "threshold": DIVERSITY_JACCARD_THRESHOLD,
            "is_diverse": jac < DIVERSITY_JACCARD_THRESHOLD,
        })

    final_routes = []
    for idx, r in enumerate(routes):
        r["properties"]["rank"] = idx + 1
        r["properties"]["explanation"] = generate_candidate_explanation(idx, r["properties"])
        final_routes.append(r)

    # Top route textual explanation (deterministic, fact-checked)
    top_text = generate_route_explanation_text([f["properties"] for f in final_routes])
    if final_routes:
        final_routes[0]["properties"]["explanation"]["text"] = top_text

    for r in final_routes:
        r.pop("_geom", None)

    return {
        "routes": len(final_routes),
        "features": final_routes,
        "diversity": diversity_metrics,
        "failed_attempts": fail_reasons,
    }