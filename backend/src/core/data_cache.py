"""
data_cache.py - Validated Data Cache Manager

When a request AOI''s origin/destination endpoints fall within the validated 
data cache geographic bounds, the cache can be reused.

The corridor planner/site finder operate on whatever raster grid is in
ws.processed_dir/cost_components/. When using the cache, the grid IS the
cached raster, and the start/end pixel indices are computed from the DEM
transform. The planner does not re-crop; it uses the full cached grid.

So the correct coverage check is: do the corridor endpoints (or the site 
centre point) lie within the cached DEM bounds? If yes, we can reuse.
"""

import logging
import shutil
from pathlib import Path

import rasterio
from rasterio.warp import transform_bounds

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent

CACHE_COST_DIR = BASE_DIR / "data" / "processed" / "cost_components"
CACHE_DEM = BASE_DIR / "data" / "processed" / "dem.tif"

# Mapping: cache filename -> planner/finder expected filename
CACHE_TO_PLANNER_MAP = {
    "water_occurrence.tif":           "surface_water.tif",
    "land_cover.tif":                 "worldcover.tif",
    "building_density.tif":           "buildings.tif",
    "rivers.tif":                     "rivers.tif",
    "protected_areas.tif":            "protected_areas.tif",
    "population.tif":                 "population.tif",
    "dist_to_highway.tif":            "highways.tif",
    "acquisition_friction_index.tif": "acquisition_friction_index.tif",
}


def _get_cache_wgs84_bounds():
    """Return WGS84 bounds of the validated DEM cache (min_lon,min_lat,max_lon,max_lat)."""
    if not CACHE_DEM.exists():
        return None
    with rasterio.open(CACHE_DEM) as src:
        b = src.bounds
        wgs = transform_bounds(src.crs, "EPSG:4326", b.left, b.bottom, b.right, b.top)
    return wgs


def check_points_within_cache(points_lonlat):
    """Return True if ALL given (lon,lat) points lie within the cached DEM extent.

    This is the correct coverage check for cache reuse: the cached raster grid
    defines the planner domain. If all critical points (corridor endpoints, site
    centre) are within that grid, we can run the planner on it.

    Args:
        points_lonlat: list of (lon, lat) tuples

    Returns:
        bool
    """
    cache_bounds = _get_cache_wgs84_bounds()
    if cache_bounds is None:
        logger.error("No cached DEM found at %s", CACHE_DEM)
        return False

    c_min_lon, c_min_lat, c_max_lon, c_max_lat = cache_bounds

    for lon, lat in points_lonlat:
        if not (c_min_lon <= lon <= c_max_lon and c_min_lat <= lat <= c_max_lat):
            logger.info(
                "Point (%.4f, %.4f) is outside cache bounds (%.3f-%.3f lon, %.3f-%.3f lat)",
                lon, lat, c_min_lon, c_max_lon, c_min_lat, c_max_lat,
            )
            return False

    logger.info(
        "All %d points within cache bounds (%.3f-%.3f lon, %.3f-%.3f lat) - cache usable",
        len(points_lonlat), c_min_lon, c_max_lon, c_min_lat, c_max_lat,
    )
    return True


def get_cache_bounds_wgs84():
    """Return the cached DEM WGS84 bounds for logging/response purposes."""
    return _get_cache_wgs84_bounds()


def populate_workspace_from_cache(workspace_manager):
    """Copy validated cache rasters into workspace processed dir with correct names.

    The workspace processed dir will contain exactly what the planner/finder
    expect: dem.tif + the mapped layer names.

    Returns True if DEM was successfully placed.
    """
    dest_dir = workspace_manager.processed_dir / "cost_components"
    dest_dir.mkdir(parents=True, exist_ok=True)

    if CACHE_DEM.exists():
        shutil.copy2(CACHE_DEM, dest_dir / "dem.tif")
        logger.info("Copied DEM -> %s", dest_dir / "dem.tif")
    else:
        logger.error("Validated cache DEM not found: %s", CACHE_DEM)
        return False

    for cache_name, planner_name in CACHE_TO_PLANNER_MAP.items():
        src = CACHE_COST_DIR / cache_name
        if src.exists():
            shutil.copy2(src, dest_dir / planner_name)
            logger.info("Copied %s -> %s", cache_name, planner_name)
        else:
            logger.warning("Cache file missing, skipping: %s", src)

    cache_bounds = _get_cache_wgs84_bounds()
    workspace_manager.manifest["data_source"] = "validated_cache"
    workspace_manager.manifest["cache_bounds_wgs84"] = list(cache_bounds) if cache_bounds else None
    workspace_manager.manifest["provenance"] = {
        "dem": str(CACHE_DEM),
        "cost_components": str(CACHE_COST_DIR),
        "geographic_coverage_wgs84": list(cache_bounds) if cache_bounds else None,
        "note": (
            "Pre-processed validated rasters reused. "
            "All corridor/site points verified within cache bounds before use."
        ),
    }
    workspace_manager.save_manifest()
    logger.info("Workspace populated from validated cache.")
    return True