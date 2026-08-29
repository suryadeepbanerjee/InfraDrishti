import os
import glob
import yaml
import geopandas as gpd
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.merge import merge
from rasterio.mask import mask
from shapely.geometry import box
import numpy as np
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data/raw"
INTERIM_DIR = BASE_DIR / "data/interim"
PROCESSED_DIR = BASE_DIR / "data/processed"

with open(BASE_DIR / "configs/aoi_config.yaml") as f:
    config = yaml.safe_load(f)

aoi_bbox = config['aoi']['bbox_wgs84']
crs_target = f"EPSG:{config['aoi']['crs_epsg']}"
res_m = config['aoi']['resolution_m']

aoi_geom_wgs84 = box(aoi_bbox['west'], aoi_bbox['south'], aoi_bbox['east'], aoi_bbox['north'])
aoi_gdf_wgs84 = gpd.GeoDataFrame({'geometry': [aoi_geom_wgs84]}, crs="EPSG:4326")
aoi_gdf_target = aoi_gdf_wgs84.to_crs(crs_target)
aoi_geom_target = aoi_gdf_target.geometry.iloc[0]
target_bounds = aoi_gdf_target.total_bounds

def process_vector(src_path, dst_path, layer=None):
    logger.info(f"Processing vector {src_path}")
    if not os.path.exists(src_path):
        logger.warning(f"Missing {src_path}")
        return
    kwargs = {}
    if layer:
        kwargs['layer'] = layer
    gdf = gpd.read_file(src_path, bbox=tuple(aoi_bbox.values()), **kwargs)
    if gdf.empty:
        logger.warning(f"Vector {src_path} is empty after bbox crop.")
        return
    # Make sure to set crs if it's not set (OSM often has it as 4326 implicitly by fiona, but let's be safe)
    if gdf.crs is None:
        gdf.set_crs("EPSG:4326", inplace=True)
        
    gdf = gdf.to_crs(crs_target)
    # CLIP USING THE TARGET GEOMETRY
    gdf = gpd.clip(gdf, aoi_geom_target)
    if not gdf.empty:
        gdf.to_file(dst_path, driver="GeoJSON")
    else:
        logger.warning(f"Vector {src_path} is empty after final clip.")

logger.info("Processing HydroRIVERS...")
# Search for the shapefile recursively
hydro_rivers_path = list(RAW_DIR.glob("hydrorivers/**/*.shp"))
if hydro_rivers_path:
    process_vector(hydro_rivers_path[0], PROCESSED_DIR / "rivers.geojson")
else:
    logger.warning("No HydroRIVERS shapefile found")

logger.info("Processing HydroBASINS...")
process_vector(RAW_DIR / "hydrobasins/hybas_as_lev12_v1c.shp", PROCESSED_DIR / "basins.geojson")

logger.info("Processing OSM Lines (Roads/Railways)...")
process_vector(RAW_DIR / "maharashtra-latest.osm.pbf", PROCESSED_DIR / "infrastructure_lines.geojson", layer="lines")

logger.info("Processing OSM Polygons (Buildings)...")
process_vector(RAW_DIR / "maharashtra-latest.osm.pbf", PROCESSED_DIR / "infrastructure_polygons.geojson", layer="multipolygons")

logger.info("Vector Preprocessing Pipeline Complete!")
