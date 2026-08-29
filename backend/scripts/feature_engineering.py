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
logger.info("Computing building density...")
try:
    buildings = gpd.read_file(PROCESSED_DIR / "infrastructure_polygons.geojson")
    if not buildings.empty:
        # Add a dummy field for rasterization
        buildings['val'] = 1
        building_raster = rasterize(
            [(geom, 1) for geom in buildings.geometry],
            out_shape=shape,
            transform=transform,
            fill=0,
            all_touched=True,
            dtype=np.uint8
        )
    else:
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

# 7. Acquisition Friction Index (Proxy composite)
logger.info("Computing acquisition_friction_index...")
# Combine normalized pop, building density, and land cover proxies
pop_norm = np.clip(pop / 100.0, 0, 1) # simple normalization (cap at 100 people per pixel)
build_norm = building_raster.astype(np.float32) # already 0/1 for presence

# LC cost proxy
lc_friction = np.zeros_like(pop_norm, dtype=np.float32)
lc_friction[lc == 50] = 0.9 # Built-up
lc_friction[lc == 40] = 0.4 # Cropland
lc_friction[lc == 10] = 0.6 # Forest

afi = (pop_norm * 0.3) + (build_norm * 0.4) + (lc_friction * 0.3)
write_raster(COST_DIR / "acquisition_friction_index.tif", afi.astype(np.float32), meta)

logger.info("Feature Engineering Complete!")
