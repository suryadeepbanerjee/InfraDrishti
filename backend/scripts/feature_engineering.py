import os
import geopandas as gpd
import rasterio
from rasterio.features import rasterize
import numpy as np
import logging
from pathlib import Path
from scipy.ndimage import distance_transform_edt
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data/processed"
COST_DIR = PROCESSED_DIR / "cost_components"
COST_DIR.mkdir(parents=True, exist_ok=True)

# Helper to read raster and metadata
def read_raster(path):
    with rasterio.open(path) as src:
        data = src.read(1)
        meta = src.meta.copy()
        return data, meta

def write_raster(path, data, meta):
    meta.update({'dtype': data.dtype.name, 'compress': 'deflate'})
    with rasterio.open(path, 'w', **meta) as dst:
        dst.write(data, 1)

logger.info("Loading base grid (DEM)...")
dem, meta = read_raster(PROCESSED_DIR / "dem.tif")
nodata_mask = (dem == meta['nodata']) if meta['nodata'] is not None else np.isnan(dem)
transform = meta['transform']
shape = dem.shape
res = transform[0]

# 1. Slope (from DEM)
logger.info("Computing slope...")
dx, dy = np.gradient(dem, res, res)
slope = np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))
slope[nodata_mask] = np.nan
write_raster(COST_DIR / "slope.tif", slope.astype(np.float32), meta)

# 2. Population (already aligned)
logger.info("Processing population...")
pop, _ = read_raster(PROCESSED_DIR / "population.tif")
pop[nodata_mask] = 0
write_raster(COST_DIR / "population.tif", pop, meta)

# 3. Land Cover (already aligned)
logger.info("Processing land cover...")
lc, lc_meta = read_raster(PROCESSED_DIR / "land_cover.tif")
write_raster(COST_DIR / "land_cover.tif", lc, lc_meta)

# 4. Building Density
logger.info("Computing building density (real building footprints only)...")
try:
    polys = gpd.read_file(PROCESSED_DIR / "infrastructure_polygons.geojson")
    # Filter to actual building footprints.
    # OSM 'building' tag is the canonical field; fall back to area filter
    # (real roofprints are < 10,000 m²; roads/fields etc. are much larger).
    if 'building' in polys.columns:
        buildings = polys[polys['building'].notnull() & (polys['building'] != 'no')]
        logger.info(f"Filtered to {len(buildings)} building footprints (building tag)")
    else:
        # Geometry-based fallback: keep only small polygons likely to be buildings
        polys['_area'] = polys.geometry.area
        buildings = polys[polys['_area'] < 5000]  # < 5000 m²
        logger.info(f"No 'building' column; area-filtered to {len(buildings)} small polygons")

    if not buildings.empty:
        # Reproject to raster CRS if needed (GeoJSON is usually WGS84)
        raster_crs = meta['crs']
        if buildings.crs is not None and buildings.crs != raster_crs:
            logger.info(f"Reprojecting buildings from {buildings.crs} -> {raster_crs}")
            buildings = buildings.to_crs(raster_crs)
        elif buildings.crs is None:
            logger.warning("Building GeoJSON has no CRS; assuming EPSG:4326 and reprojecting")
            import pyproj
            buildings = buildings.set_crs("EPSG:4326").to_crs(raster_crs)

        building_raster = rasterize(
            [(geom, 1) for geom in buildings.geometry],
            out_shape=shape,
            transform=transform,
            fill=0,
            all_touched=True,    # needed: buildings are small vs 50m pixels
            dtype=np.uint8
        )
        nonzero_pct = (building_raster > 0).mean() * 100
        logger.info(f"Building raster: {nonzero_pct:.1f}% nonzero (should be ~1-5% for real data)")
        if nonzero_pct > 20:
            logger.warning(
                f"Building raster is {nonzero_pct:.1f}% nonzero — unusually high. "
                "Check infrastructure_polygons.geojson content."
            )

    else:
        logger.warning("No building footprints found; using zero raster.")
        building_raster = np.zeros(shape, dtype=np.uint8)
except Exception as e:
    logger.warning(f"Could not load buildings: {e}")
    building_raster = np.zeros(shape, dtype=np.uint8)
write_raster(COST_DIR / "building_density.tif", building_raster, meta)

# 5. Infrastructure Distance (Highways)
logger.info("Computing distance to highways...")
try:
    lines = gpd.read_file(PROCESSED_DIR / "infrastructure_lines.geojson")
    # Filter for highways (tags might vary, fallback to all lines if no highway tag)
    highways = lines[lines['highway'].notnull()] if 'highway' in lines.columns else lines
    if not highways.empty:
        highway_raster = rasterize(
            [(geom, 1) for geom in highways.geometry],
            out_shape=shape,
            transform=transform,
            fill=0,
            all_touched=True,
            dtype=np.uint8
        )
        # 1 inside highway, 0 outside. Invert for EDT.
        dist = distance_transform_edt(highway_raster == 0) * res
    else:
        dist = np.full(shape, 10000.0)
except Exception as e:
    logger.warning(f"Could not load highways: {e}")
    dist = np.full(shape, 10000.0)
write_raster(COST_DIR / "dist_to_highway.tif", dist.astype(np.float32), meta)

# 6. Hydrology (Rivers / Water bodies)
logger.info("Processing hydrology...")
try:
    rivers = gpd.read_file(PROCESSED_DIR / "rivers.geojson")
    if not rivers.empty:
        river_raster = rasterize(
            [(geom, 1) for geom in rivers.geometry],
            out_shape=shape,
            transform=transform,
            fill=0,
            all_touched=True,
            dtype=np.uint8
        )
    else:
        river_raster = np.zeros(shape, dtype=np.uint8)
except:
    river_raster = np.zeros(shape, dtype=np.uint8)
write_raster(COST_DIR / "rivers.tif", river_raster, meta)

water_occ, _ = read_raster(PROCESSED_DIR / "water_occurrence.tif")
write_raster(COST_DIR / "water_occurrence.tif", water_occ, meta)

# 7. Acquisition Friction Index
logger.info("Computing acquisition_friction_index...")
# AFI = land-acquisition difficulty proxy [0, 1].
# Formula: weighted sum of normalized population density + land-cover friction.
# We intentionally EXCLUDE building_raster here because the OSM polygon dataset
# that feeds building_density.tif may be miscategorised (all-polygons vs.
# buildings-only). Land cover class 50 (built-up) from ESA WorldCover is the
# reliable built-environment signal.
pop_norm = np.clip(pop / 100.0, 0, 1)   # WorldPop per 50m cell, cap at 100 ppl

lc_friction = np.zeros_like(pop_norm, dtype=np.float32)
lc_friction[lc == 50] = 0.90  # Built-up (urban) — hardest to acquire
lc_friction[lc == 40] = 0.50  # Cropland — moderate (private agricultural land)
lc_friction[lc == 10] = 0.35  # Forest — government/reserved land, complex
lc_friction[lc == 80] = 0.20  # Permanent water — usually avoided outright
lc_friction[lc == 30] = 0.30  # Grassland — easier than cropland
lc_friction[lc == 20] = 0.25  # Shrubland
# Classes 0, 60, 90 (bare/sparse) default to 0

# 60% weight on land cover (reliable), 40% on population density (proxy for
# urbanisation pressure)
afi = np.clip((lc_friction * 0.60) + (pop_norm * 0.40), 0.0, 1.0)

lc_pcts = {int(k): float(round((lc==k).mean()*100, 1)) for k in [10,20,30,40,50,60,80,90]}
logger.info(f"AFI: mean={afi.mean():.3f}, std={afi.std():.3f}, land_cover_pcts={lc_pcts}")
write_raster(COST_DIR / "acquisition_friction_index.tif", afi.astype(np.float32), meta)

logger.info("Feature Engineering Complete!")
