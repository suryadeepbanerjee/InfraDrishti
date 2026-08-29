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

BASE_DIR = Path(r"D:\Learn\B_Tech\Hackathons\1_BuildWithBharat\Prototype\Model")
RAW_DIR = BASE_DIR / "data/raw"
INTERIM_DIR = BASE_DIR / "data/interim"
PROCESSED_DIR = BASE_DIR / "data/processed"
INTERIM_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

with open(BASE_DIR / "configs/aoi_config.yaml") as f:
    config = yaml.safe_load(f)

aoi_bbox = config['aoi']['bbox_wgs84']
crs_target = f"EPSG:{config['aoi']['crs_epsg']}"
res_m = config['aoi']['resolution_m']

aoi_geom = box(aoi_bbox['west'], aoi_bbox['south'], aoi_bbox['east'], aoi_bbox['north'])
aoi_gdf_wgs84 = gpd.GeoDataFrame({'geometry': [aoi_geom]}, crs="EPSG:4326")
aoi_gdf_target = aoi_gdf_wgs84.to_crs(crs_target)
target_bounds = aoi_gdf_target.total_bounds

def align_raster(src_path, dst_path, target_bounds, res, resampling_method=Resampling.nearest, nodata=None):
    if not os.path.exists(src_path):
        logger.warning(f"Missing {src_path}")
        return
    logger.info(f"Aligning {src_path} -> {dst_path}")
    with rasterio.open(src_path) as src:
        width = int(np.ceil((target_bounds[2] - target_bounds[0]) / res))
        height = int(np.ceil((target_bounds[3] - target_bounds[1]) / res))
        transform = rasterio.transform.from_bounds(*target_bounds, width, height)
        
        kwargs = src.meta.copy()
        kwargs.update({
            'crs': crs_target,
            'transform': transform,
            'width': width,
            'height': height,
            'compress': 'deflate'
        })
        if nodata is not None:
            kwargs['nodata'] = nodata
            
        with rasterio.open(dst_path, 'w', **kwargs) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=crs_target,
                    resampling=resampling_method
                )

def merge_and_align_rasters(glob_pattern, dst_path, target_bounds, res, resampling_method=Resampling.nearest, nodata=None):
    files = glob.glob(str(glob_pattern))
    if not files:
        logger.warning(f"No files found for {glob_pattern}")
        return
    logger.info(f"Merging {len(files)} files for {dst_path}")
    
    src_files_to_mosaic = []
    for fp in files:
        src = rasterio.open(fp)
        src_files_to_mosaic.append(src)
        
    mosaic, out_trans = merge(src_files_to_mosaic, bounds=(aoi_bbox['west'], aoi_bbox['south'], aoi_bbox['east'], aoi_bbox['north']))
    out_meta = src.meta.copy()
    
    interim_path = INTERIM_DIR / f"temp_{os.path.basename(dst_path)}"
    out_meta.update({
        "driver": "GTiff",
        "height": mosaic.shape[1],
        "width": mosaic.shape[2],
        "transform": out_trans,
        "compress": "deflate"
    })
    
    with rasterio.open(interim_path, "w", **out_meta) as dest:
        dest.write(mosaic)
        
    for src in src_files_to_mosaic:
        src.close()
        
    align_raster(interim_path, dst_path, target_bounds, res, resampling_method, nodata)
    os.remove(interim_path)

logger.info("Processing WorldPop...")
align_raster(RAW_DIR / "worldpop/ind_ppp_2020.tif", PROCESSED_DIR / "population.tif", target_bounds, res_m, Resampling.bilinear)

logger.info("Processing JRC Water...")
# JRC has two tiles for the AOI: occurrence_70E_10N and 70E_20N
merge_and_align_rasters(RAW_DIR / "jrc_gsw/*.tif", PROCESSED_DIR / "water_occurrence.tif", target_bounds, res_m, Resampling.nearest, nodata=255)

logger.info("Processing Copernicus DEM...")
merge_and_align_rasters(RAW_DIR / "copernicus_dem/*.tif", PROCESSED_DIR / "dem.tif", target_bounds, res_m, Resampling.bilinear)

logger.info("Processing ESA WorldCover...")
merge_and_align_rasters(RAW_DIR / "worldcover/*.tif", PROCESSED_DIR / "land_cover.tif", target_bounds, res_m, Resampling.nearest)

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
    gdf = gdf.to_crs(crs_target)
    gdf = gpd.clip(gdf, aoi_geom)
    if not gdf.empty:
        gdf.to_file(dst_path, driver="GeoJSON")
    else:
        logger.warning(f"Vector {src_path} is empty after final clip.")

logger.info("Processing HydroRIVERS...")
process_vector(RAW_DIR / "hydrorivers/HydroRIVERS_v10_as.shp", PROCESSED_DIR / "rivers.geojson")

logger.info("Processing HydroBASINS...")
process_vector(RAW_DIR / "hydrobasins/hybas_as_lev12_v1c.shp", PROCESSED_DIR / "basins.geojson")

logger.info("Processing OSM Lines (Roads/Railways)...")
process_vector(RAW_DIR / "maharashtra-latest.osm.pbf", PROCESSED_DIR / "infrastructure_lines.geojson", layer="lines")

logger.info("Processing OSM Polygons (Buildings)...")
process_vector(RAW_DIR / "maharashtra-latest.osm.pbf", PROCESSED_DIR / "infrastructure_polygons.geojson", layer="multipolygons")

logger.info("Preprocessing Pipeline Complete!")
