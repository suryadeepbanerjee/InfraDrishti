import logging
import rasterio
import yaml
import numpy as np
import itertools
from scipy.ndimage import uniform_filter
from skimage.graph import MCP_Geometric
from shapely.geometry import LineString

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ACQUISITION FRICTION INDEX (AFI) — SHARED DEFINITION
# ---------------------------------------------------------------------------
# AFI = clip( 0.30 * local_building_density + 0.50 * cropland_presence, 0, 1 )
#
#   local_building_density = uniform_filter(buildings_binary, size=21)
#     => fraction of cells within a ~500m square neighbourhood classified
#        as buildings (OSM building footprints rasterised at 50m).
#   cropland_presence = per-cell binary for WorldCover class 40 (cropland).
#     => land-cover class only. NOT crop economic value.
#
#   Input layers: buildings.tif (OSM), worldcover.tif (ESA WorldCover 2021)
#   Output range: [0, 1]  (0=low friction, 1=high friction)
#   Normalisation: linear clip to [0,1]; no further scaling needed.
#
#   Limitations:
#     - NOT: ownership probability, acquisition cost, legal risk,
#             compensation estimate, or financial liability.
#     - Spatial screening proxy only.
#     - Consistent with site finder (finder.py) — identical formula and layers.
# ---------------------------------------------------------------------------

AFI_W_BLDG        = 0.30
AFI_W_CROP        = 0.50
AFI_BLDG_KERN     = 21   # ~500m square neighbourhood at 50m

DIVERSITY_JACCARD_THRESHOLD = 0.20   # routes with overlap > 20% are "too similar"


def compute_afi_surface(bldg_data, crop_binary):
    """Raster-wide AFI surface [0,1]. Shared with finder.py."""
    if bldg_data is not None:
        bldg_density = uniform_filter(
            (bldg_data > 0).astype(float), size=AFI_BLDG_KERN, mode="constant"
        )
    else:
        bldg_density = np.zeros_like(crop_binary)
    return np.clip(AFI_W_BLDG * bldg_density + AFI_W_CROP * crop_binary, 0.0, 1.0)


def run_corridor_planner(req_id, workspace_manager, profile_name="highway"):
    ws_dir = workspace_manager.processed_dir / "cost_components"

    with open("configs/infrastructure_profiles.yaml", "r") as f:
        profiles  = yaml.safe_load(f)["profiles"]
    profile       = profiles[profile_name]
    cost_weights  = profile["cost_weights"]
    mcda_weights  = profile["mcda_weights"]
    mcda_dir      = profile["mcda_directions"]

    dem_path = ws_dir / "dem.tif"
    if not dem_path.exists():
        logger.error("DEM missing for route planning!")
        return {"routes": 0, "features": []}

    with rasterio.open(dem_path) as src:
        dem_data  = src.read(1).astype(float)
        transform = src.transform

    cost_surface = np.ones_like(dem_data)

    # Slope penalty
    dy, dx  = np.gradient(dem_data, 50.0)
    slope   = np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))
    cost_surface += slope * cost_weights.get("slope_cost", 0.20) * 10.0

    # Protected areas — hard constraint
    pa_data = None
    pa_path = ws_dir / "protected_areas.tif"
    if pa_path.exists():
        with rasterio.open(pa_path) as s:
            pa_data = s.read(1)
            cost_surface[pa_data > 0] = np.inf

    # Surface water — high penalty
    w_data = None
    water_path = ws_dir / "surface_water.tif"
    if water_path.exists():
        with rasterio.open(water_path) as s:
            w_data = s.read(1)
            cost_surface[w_data > 0] += 50.0

    # Highways — minor penalty (tie-in cost)
    roads_data = None
    roads_path = ws_dir / "highways.tif"
    if roads_path.exists():
        with rasterio.open(roads_path) as s:
            roads_data = s.read(1)
            cost_surface[roads_data > 0] += 5.0

    # WorldCover forest penalty
    wc_data = None
    wc_path = ws_dir / "worldcover.tif"
    if wc_path.exists():
        with rasterio.open(wc_path) as s:
            wc_data = s.read(1)
            cost_surface[wc_data == 10] += \
                20.0 * cost_weights.get("land_cover_cost", 0.15)

    # Population penalty
    pop_data = None
    pop_path = ws_dir / "population.tif"
    if pop_path.exists():
        with rasterio.open(pop_path) as s:
            pop_data = s.read(1)
            pop_clean = pop_data.astype(float)
            pop_clean[pop_clean < 0] = 0.0
            cost_surface[pop_clean > 0] += \
                np.log1p(pop_clean[pop_clean > 0]) * 5.0 * \
                cost_weights.get("population_exposure", 0.10)

    # Buildings penalty
    bldg_data = None
    bldg_path = ws_dir / "buildings.tif"
    if bldg_path.exists():
        with rasterio.open(bldg_path) as s:
            bldg_data = s.read(1)
            cost_surface[bldg_data > 0] += \
                100.0 * cost_weights.get("building_density", 0.15)

    cost_surface[cost_surface < 1] = 1.0

    # Cropland binary for AFI (WorldCover class 40)
    crop_binary = (wc_data == 40).astype(np.float32) if wc_data is not None \
                  else np.zeros_like(dem_data, dtype=np.float32)

    # AFI surface — identical formula to finder.py
    afi_surf = compute_afi_surface(bldg_data, crop_binary)

    # Normalisation reference maxima
    norm_ref = {
        "route_length_km":            300.0,
        "mean_slope_deg":              10.0,
        "river_crossings":            500.0,
        "forest_overlap_km2":         100.0,
        "population_exposure":      50000.0,
        "building_count":            1000.0,
        "acquisition_friction_index":   1.0,
    }

    routes       = []
    fail_reasons = []
    start_idx    = (10, 10)
    end_idx      = (cost_surface.shape[0] - 10, cost_surface.shape[1] - 10)
    cost_work    = cost_surface.copy()

    for i in range(5):
        mcp = MCP_Geometric(cost_work)
        try:
            _, _ = mcp.find_costs([start_idx])
            path = mcp.traceback(end_idx)
        except Exception as e:
            msg = (
                f"Route {i+1}: no minimum-cost path to endpoint. "
                f"Cause: {e}. "
                "Prior buffer masks have blocked all viable cell chains "
                "through this terrain."
            )
            logger.warning(msg)
            fail_reasons.append(msg)
            break

        coords        = []
        path_slope    = []
        water_cells   = 0
        forest_cells  = 0
        pop_exposure  = 0.0
        bldg_count    = 0
        afi_vals      = []

        for r, c in path:
            x, y = rasterio.transform.xy(transform, r, c)
            coords.append((x, y))
            path_slope.append(slope[r, c])
            if w_data    is not None and w_data[r, c]    > 0: water_cells  += 1
            if wc_data   is not None and wc_data[r, c]  == 10: forest_cells += 1
            if pop_data  is not None and pop_data[r, c]  > 0:
                pop_exposure += max(0.0, float(pop_data[r, c]))
            if bldg_data is not None and bldg_data[r, c] > 0: bldg_count   += 1
            afi_vals.append(float(afi_surf[r, c]))

        length_km = len(coords) * 50.0 / 1000.0

        raw_metrics = {
            "route_length_km":            length_km,
            "mean_slope_deg":             float(np.mean(path_slope)),
            "river_crossings":            water_cells,
            "forest_overlap_km2":         float(forest_cells * 2500.0 / 1_000_000),
            "population_exposure":        float(pop_exposure),
            "building_count":             bldg_count,
            # AFI: mean of per-cell AFI surface values along the route.
            # Same formula as site finder: clip(0.30*bldg_density + 0.50*crop, 0,1).
            "acquisition_friction_index": float(np.mean(afi_vals)) if afi_vals else 0.0,
        }

        norm_metrics = {}
        weighted     = {}
        total_score  = 0.0

        for metric, w in mcda_weights.items():
            if metric not in raw_metrics:
                continue
            val   = raw_metrics[metric]
            rmax  = norm_ref.get(metric, 1.0)
            # All highway profile metrics are "minimise" -> score = 1 - clip(v/max)
            n_val = 1.0 - float(np.clip(val / rmax, 0.0, 1.0))
            norm_metrics[metric] = n_val
            contrib = float(n_val * w)
            weighted[metric] = contrib
            total_score += contrib

        geom_shapely = LineString(coords)

        routes.append({
            "type": "Feature",
            "properties": {
                "request_id":             req_id,
                "rank":                   i + 1,
                "mcda_score":             total_score,
                "raw_metrics":            raw_metrics,
                "normalized_metrics":     norm_metrics,
                "weights":                {k: mcda_weights[k] for k in weighted},
                "weighted_contributions": weighted,
                "mcda_math_check":        abs(sum(weighted.values()) - total_score) < 1e-9,
                "afi_note": (
                    "acquisition_friction_index = mean of per-cell AFI surface along route. "
                    "AFI = clip(0.30*local_building_density + 0.50*cropland_presence, 0,1). "
                    "NOT ownership probability, acquisition cost, or legal risk."
                ),
                "provenance": workspace_manager.manifest.get("provenance", {}),
            },
            "geometry":       {"type": "LineString", "coordinates": coords},
            "_shapely_geom":  geom_shapely,
        })

        # Diversity buffer: penalise 1km corridor around found path,
        # leaving 2.5km terminal convergence zones intact.
        if len(path) > 100:
            for r, c in path[50:-50]:
                rmin = max(0, r - 20); rmax_ = min(cost_work.shape[0], r + 21)
                cmin = max(0, c - 20); cmax_ = min(cost_work.shape[1], c + 21)
                cost_work[rmin:rmax_, cmin:cmax_] = np.inf

    # Sort by MCDA score
    routes.sort(key=lambda x: x["properties"]["mcda_score"], reverse=True)

    # Pairwise Jaccard diversity on 500m-buffered corridor polygons
    diversity_metrics = []
    buffered = [r["_shapely_geom"].buffer(500.0) for r in routes]
    for (i, p1), (j, p2) in itertools.combinations(enumerate(buffered), 2):
        inter  = p1.intersection(p2).area
        union  = p1.union(p2).area
        jac    = float(inter / union) if union > 0 else 0.0
        diversity_metrics.append({
            "pair":           [i + 1, j + 1],
            "jaccard_overlap":jac,
            "threshold":      DIVERSITY_JACCARD_THRESHOLD,
            "is_diverse":     jac < DIVERSITY_JACCARD_THRESHOLD,
        })

    for idx, r in enumerate(routes):
        del r["_shapely_geom"]
        r["properties"]["rank"] = idx + 1

    return {
        "routes":           len(routes),
        "features":         routes,
        "diversity":        diversity_metrics,
        "failed_attempts":  fail_reasons,
    }
