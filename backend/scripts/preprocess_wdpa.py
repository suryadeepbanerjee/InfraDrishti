import os
import yaml
import geopandas as gpd
import rasterio
from rasterio.features import rasterize
from shapely.geometry import box
import numpy as np
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data/raw"
PROCESSED_DIR = BASE_DIR / "data/processed"
COST_DIR = PROCESSED_DIR / "cost_components"
COST_DIR.mkdir(parents=True, exist_ok=True)

with open(BASE_DIR / "configs/aoi_config.yaml") as f:
    config = yaml.safe_load(f)

aoi_bbox = config['aoi']['bbox_wgs84']
crs_target = f"EPSG:{config['aoi']['crs_epsg']}"

aoi_geom_wgs84 = box(aoi_bbox['west'], aoi_bbox['south'], aoi_bbox['east'], aoi_bbox['north'])
aoi_gdf_wgs84 = gpd.GeoDataFrame({'geometry': [aoi_geom_wgs84]}, crs="EPSG:4326")
aoi_gdf_target = aoi_gdf_wgs84.to_crs(crs_target)
aoi_geom_target = aoi_gdf_target.geometry.iloc[0]

wdpa_files = list(RAW_DIR.glob("wdpa/**/*.zip"))
logger.info(f"Found {len(wdpa_files)} WDPA zip files.")

gdfs = []
for fp in wdpa_files:
    logger.info(f"Reading {fp}")
    try:
        gdf = gpd.read_file(f"zip://{fp}", bbox=tuple(aoi_bbox.values()))
        if not gdf.empty:
            if gdf.crs is None:
                gdf.set_crs("EPSG:4326", inplace=True)
            gdf = gdf.to_crs(crs_target)
            gdf = gpd.clip(gdf, aoi_geom_target)
            if not gdf.empty:
                gdfs.append(gdf)
    except Exception as e:
        logger.warning(f"Error reading {fp}: {e}")

if gdfs:
    final_gdf = gpd.pd.concat(gdfs, ignore_index=True)
    final_gdf.to_file(PROCESSED_DIR / "protected_areas.geojson", driver="GeoJSON")
    logger.info(f"Saved protected_areas.geojson with {len(final_gdf)} features.")
    
    with rasterio.open(PROCESSED_DIR / "dem.tif") as src:
        meta = src.meta.copy()
        shape = src.shape
        transform = src.transform
        
    pa_raster = rasterize(
        [(geom, 1) for geom in final_gdf.geometry],
        out_shape=shape,
        transform=transform,
        fill=0,
        all_touched=True,
        dtype=np.uint8
    )
    meta.update({'dtype': 'uint8', 'nodata': None, 'compress': 'deflate'})
    with rasterio.open(COST_DIR / "protected_areas.tif", 'w', **meta) as dst:
        dst.write(pa_raster, 1)
    logger.info("Saved protected_areas.tif mask.")
else:
    logger.warning("No WDPA geometries found in AOI. Creating empty mask.")
    with rasterio.open(PROCESSED_DIR / "dem.tif") as src:
        meta = src.meta.copy()
        shape = src.shape
    meta.update({'dtype': 'uint8', 'nodata': None, 'compress': 'deflate'})
    with rasterio.open(COST_DIR / "protected_areas.tif", 'w', **meta) as dst:
        dst.write(np.zeros(shape, dtype=np.uint8), 1)

logger.info("WDPA Preprocessing Complete!")
