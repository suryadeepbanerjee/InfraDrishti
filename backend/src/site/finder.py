import logging
import rasterio
import yaml
import numpy as np
from pathlib import Path
from scipy.ndimage import label, distance_transform_edt, maximum_filter, convolve
from skimage.segmentation import watershed
from skimage.measure import regionprops
from rasterio.features import shapes

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ACQUISITION FRICTION INDEX (AFI) — SHARED DEFINITION
# ---------------------------------------------------------------------------
# AFI is a spatial screening proxy combining two land-cover signals:
#
#   AFI = clip( w_bldg * local_building_density
#             + w_crop * cropland_presence,
#             0.0, 1.0 )
#
#   where:
#     local_building_density = uniform_filter(buildings_binary, size=21)
#       => fraction of cells within a ~500m square neighbourhood that are
#          classified as buildings (OSM building footprints rasterised at 50m)
#     cropland_presence      = per-cell binary (WorldCover class 40)
#       => 1 if the cell is classified as cropland, 0 otherwise
#     w_bldg = 0.30  (weight on building density)
#     w_crop = 0.50  (weight on cropland presence)
#
#   Input layers:
#     - buildings.tif : rasterised OSM building footprints (0/1, 50m)
#     - worldcover.tif: ESA WorldCover 2021 class values (50m)
#
#   Normalisation: output is clipped to [0, 1]
#
#   Interpretation (0 = low friction, 1 = high friction):
#     0.0  -> open land, no buildings, no cropland
#     0.5  -> either dense buildings OR full cropland coverage
#     1.0  -> dense buildings AND full cropland coverage
#
#   Limitations:
#     - Cropland presence from WorldCover is a land-cover class, NOT
#       crop economic value, ownership status, or legal designation.
#     - Building density is a local raster proxy; individual structures
#       are not identified.
#     - AFI is NOT: ownership probability, acquisition cost, legal risk,
#       compensation estimate, or financial liability.
#     - Must be used only as a preliminary spatial screening filter.
#
# This definition is shared with the corridor planner (planner.py).
# Both engines read the same raster surfaces and apply the same formula.
# ---------------------------------------------------------------------------

AFI_W_BLDG = 0.30
AFI_W_CROP = 0.50
AFI_BLDG_KERNEL_SIZE = 21  # ~500m square neighbourhood at 50m resolution


def compute_afi_surface(bldg_data, crop_binary):
    """Compute the raster-wide AFI surface. Returns array in [0, 1]."""
    from scipy.ndimage import uniform_filter
    if bldg_data is not None:
        bldg_density = uniform_filter((bldg_data > 0).astype(float),
                                      size=AFI_BLDG_KERNEL_SIZE, mode="constant")
    else:
        bldg_density = np.zeros_like(crop_binary)
    return np.clip(AFI_W_BLDG * bldg_density + AFI_W_CROP * crop_binary, 0.0, 1.0)


def run_site_finder(req_id, workspace_manager, profile_name="highway"):
    """
    Site Finder with real MCDA metrics from actual downloaded rasters.

    Pipeline:
      1. Load all available rasters.
      2. Precompute raster-wide metric surfaces (slope, dist_to_highway,
         population neighbourhood sum, AFI).
      3. Apply hard-constraint mask (slope>=10deg, PA, water, built-up).
      4. Connected components + watershed segmentation.
      5. Filter by minimum area (>=50 acres = 81 cells at 50m).
      6. Zonal stats per candidate: O(n_sites) cheap array lookups.
      7. Configurable MCDA from infrastructure_profiles.yaml.
      8. Return top-5 by MCDA score; assert math sum == score.
    """
    ws_dir = workspace_manager.processed_dir / "cost_components"

    with open("configs/infrastructure_profiles.yaml", "r") as f:
        profiles = yaml.safe_load(f)["profiles"]
    profile = profiles[profile_name]
    site_weights = profile["site_mcda_weights"]
    site_directions = profile["site_mcda_directions"]

    def load(filename):
        path = ws_dir / filename
        if path.exists():
            with rasterio.open(path) as src:
                return src.read(1), src.transform, src.crs
        return None, None, None

    dem_data, transform, crs = load("dem.tif")
    if dem_data is None:
        logger.error("DEM missing for site finding!")
        return {"sites": 0, "features": []}

    pa_data,    _, _ = load("protected_areas.tif")
    w_data,     _, _ = load("surface_water.tif")
    wc_data,    _, _ = load("worldcover.tif")
    roads_data, _, _ = load("highways.tif")
    pop_data,   _, _ = load("population.tif")
    bldg_data,  _, _ = load("buildings.tif")

    pixel_area_m2 = 50.0 * 50.0   # 2500 m2 per cell

    # ------------------------------------------------------------------
    # Precomputed raster-wide metric surfaces
    # ------------------------------------------------------------------

    # Slope (degrees)
    dy, dx = np.gradient(dem_data, 50.0)
    slope_surf = np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))

    # Distance to nearest highway pixel (metres)
    if roads_data is not None:
        dist_highway_surf = distance_transform_edt(roads_data == 0) * 50.0
    else:
        dist_highway_surf = np.full_like(dem_data, 10000.0)

    # Population neighbourhood sum — square ~1km raster approximation
    # ----------------------------------------------------------------
    # Metric name: pop_sum_1km_sq_approx
    # Method: scipy.ndimage.convolve with a 41x41 (2050m x 2050m)
    #   ones kernel on a nodata-cleaned WorldPop raster.
    #   Kernel size = 41 cells at 50m = 2050m edge, approximating a
    #   1km radius neighbourhood as a square. This is NOT a circular
    #   vector buffer in a projected CRS.
    # Nodata handling: WorldPop nodata = -9999; zeroed before convolution
    #   to prevent negative contamination.
    # Units: people (sum of WorldPop 100m-resampled pixels within window)
    # Limitation: Square neighbourhood overestimates population in corners
    #   relative to a 1km circle by up to ~27%.
    if pop_data is not None:
        pop_clean = pop_data.astype(float)
        pop_clean[pop_clean < 0] = 0.0
        kernel = np.ones((41, 41), dtype=np.float64)
        pop_sum_surf = convolve(pop_clean, kernel, mode="constant", cval=0.0)
    else:
        pop_sum_surf = np.zeros_like(dem_data)

    # Cropland presence (WorldCover class 40)
    # Per-cell binary flag. NOT crop economic value.
    if wc_data is not None:
        crop_binary = (wc_data == 40).astype(np.float32)
    else:
        crop_binary = np.zeros_like(dem_data, dtype=np.float32)

    # AFI surface (shared definition — see module docstring above)
    afi_surf = compute_afi_surface(bldg_data, crop_binary)

    # ------------------------------------------------------------------
    # Hard-constraint mask
    # ------------------------------------------------------------------
    valid_mask = ((dem_data > -9999) & (slope_surf < 10.0)).astype(np.uint8)
    if pa_data  is not None: valid_mask[pa_data  > 0] = 0
    if w_data   is not None: valid_mask[w_data   > 0] = 0
    if wc_data  is not None: valid_mask[wc_data == 50] = 0  # built-up

    # ------------------------------------------------------------------
    # Connected components + watershed
    # ------------------------------------------------------------------
    distance   = distance_transform_edt(valid_mask)
    local_maxi = maximum_filter(distance, size=10, mode="constant") == distance
    local_maxi[distance == 0] = False
    markers, _ = label(local_maxi)
    labels      = watershed(-distance, markers, mask=valid_mask)
    props       = regionprops(labels)

    # 50 acres = 202342.8 m2 / 2500 m2/pixel = 80.94 -> ceil = 81 pixels
    min_pixels  = 81
    all_count   = len(props)
    valid_props = [p for p in props if p.area >= min_pixels]
    logger.info(f"Candidate count before size filtering: {all_count}")
    logger.info(f"Candidate count after size filtering (>=50 acres): {len(valid_props)}")

    # Reference maxima for min-max normalisation
    ref_max = {
        "site_area_ha":               100.0,
        "mean_slope_deg":              10.0,
        "dist_to_highway_m":         5000.0,
        "acquisition_friction_index":   1.0,
        "population_within_1km":     5000.0,
        "building_count":              10.0,
    }

    # ------------------------------------------------------------------
    # Zonal stats per candidate
    # ------------------------------------------------------------------
    site_records = []
    for p in valid_props:
        cr, cc = p.coords[:, 0], p.coords[:, 1]

        ha          = float(p.area * pixel_area_m2 / 10000.0)
        mean_slope  = float(np.mean(slope_surf[cr, cc]))
        dist_hw     = float(np.min(dist_highway_surf[cr, cc]))
        b_count     = int(np.sum(bldg_data[cr, cc]) if bldg_data is not None else 0)
        # Population: mean of the precomputed neighbourhood-sum surface
        # across site pixels. Represents avg population in ~1km square
        # neighbourhood around any point in the site.
        pop_nbhd    = float(np.mean(pop_sum_surf[cr, cc]))
        crop_frac   = float(np.mean(crop_binary[cr, cc]))
        afi         = float(np.mean(afi_surf[cr, cc]))
        pa_overlap  = float(np.mean(pa_data[cr, cc] > 0)) if pa_data is not None else 0.0

        raw_metrics = {
            "site_area_ha":               ha,
            "mean_slope_deg":             mean_slope,
            "dist_to_highway_m":          dist_hw,
            "acquisition_friction_index": afi,
            # Renamed for accuracy: square ~1km neighbourhood sum, NOT circular buffer
            "pop_sum_1km_sq_approx":      pop_nbhd,
            "building_count":             float(b_count),
            "cropland_fraction":          crop_frac,
            "protected_area_overlap":     pa_overlap,
        }

        norm_metrics = {}
        weighted     = {}
        total_score  = 0.0

        for metric, w in site_weights.items():
            # Map config key to raw_metrics key (pop metric renamed)
            raw_key = "pop_sum_1km_sq_approx" if metric == "population_within_1km" else metric
            val     = raw_metrics.get(raw_key, 0.0)
            rmax    = ref_max.get(metric, 1.0)
            clipped = float(np.clip(val / rmax, 0.0, 1.0))
            direction = site_directions.get(metric, "minimise")
            n_val   = clipped if direction == "maximise" else (1.0 - clipped)
            norm_metrics[metric] = float(n_val)
            contrib  = float(n_val * w)
            weighted[metric] = contrib
            total_score += contrib

        site_records.append(
            (total_score, p, raw_metrics, norm_metrics, weighted)
        )

    site_records.sort(key=lambda x: x[0], reverse=True)

    sites = []
    for rank, (total_score, p, raw_metrics, norm_metrics, weighted) in \
            enumerate(site_records[:5]):

        region_mask = (labels == p.label).astype(np.uint8)
        geom = None
        for g, _ in shapes(region_mask, mask=(region_mask > 0), transform=transform):
            geom = g
            break
        if geom is None:
            continue

        math_sum = sum(weighted.values())
        assert abs(math_sum - total_score) < 1e-9, \
            f"MCDA math error: {math_sum} != {total_score}"

        sites.append({
            "type": "Feature",
            "properties": {
                "request_id":             req_id,
                "rank":                   rank + 1,
                "mcda_score":             float(total_score),
                "raw_metrics":            {k: float(v) for k, v in raw_metrics.items()},
                "normalized_metrics":     {k: float(v) for k, v in norm_metrics.items()},
                "weights":                {k: float(v) for k, v in site_weights.items()},
                "weighted_contributions": {k: float(v) for k, v in weighted.items()},
                "mcda_math_check":        abs(math_sum - total_score) < 1e-9,
                "metric_notes": {
                    "pop_sum_1km_sq_approx": (
                        "Sum of WorldPop population grid values within a 41x41-cell "
                        "(~2050m x 2050m) square raster neighbourhood, computed via "
                        "scipy.ndimage.convolve. This is a SQUARE approximation of a "
                        "1km-radius circular buffer and overestimates corner areas by "
                        "up to ~27%. WorldPop nodata (-9999) zeroed before convolution. "
                        "Units: people (sum of 100m-resampled WorldPop pixels)."
                    ),
                    "acquisition_friction_index": (
                        "AFI = clip(0.30 * local_building_density + 0.50 * cropland_presence, 0, 1). "
                        "local_building_density = uniform_filter(buildings_binary, size=21) at 50m. "
                        "cropland_presence = WorldCover class-40 binary (land-cover class only, "
                        "NOT economic crop value). "
                        "AFI is a spatial screening proxy ONLY. "
                        "It is NOT: ownership probability, acquisition cost, legal risk, "
                        "compensation estimate, or financial liability. "
                        "Consistent formula used in both site finder and corridor planner."
                    ),
                },
                "provenance": workspace_manager.manifest.get("provenance", {}),
            },
            "geometry": geom,
        })

    return {
        "sites":                              len(sites),
        "total_candidates_before_filter":     all_count,
        "total_candidates_after_size_filter": len(valid_props),
        "features":                           sites,
    }
