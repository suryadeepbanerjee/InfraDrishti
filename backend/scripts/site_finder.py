import os
import yaml
import numpy as np
import rasterio
import geopandas as gpd
from shapely.geometry import Polygon
import json
import logging
from pathlib import Path
from scipy.ndimage import label
from rasterio.features import shapes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
COST_DIR = BASE_DIR / "data/processed/cost_components"
OUTPUT_DIR = BASE_DIR / "outputs"

with open(BASE_DIR / "configs/aoi_config.yaml") as f:
    config = yaml.safe_load(f)

def read_raster(path):
    with rasterio.open(path) as src:
        return src.read(1), src.meta.copy()

slope, meta = read_raster(COST_DIR / "slope.tif")
lc, _ = read_raster(COST_DIR / "land_cover.tif")
water_occ, _ = read_raster(COST_DIR / "water_occurrence.tif")
dist_highway, _ = read_raster(COST_DIR / "dist_to_highway.tif")

res = meta['transform'][0]
req_area_m2 = config['site_demo']['required_area_m2']
min_pixels = int(np.ceil(req_area_m2 / (res * res)))
max_dist_hwy = config['site_demo']['proximity_constraints']['max_dist_to_highway_m']
max_slope = config['site_demo']['proximity_constraints']['max_slope_deg']

logger.info("Building hard constraint mask for sites...")
mask = np.ones_like(slope, dtype=np.uint8)

# Constraints
mask[water_occ >= 50] = 0
mask[lc == 50] = 0 # Built-up
mask[lc == 80] = 0 # Water
mask[slope > max_slope] = 0
mask[dist_highway > max_dist_hwy] = 0
mask[np.isnan(slope)] = 0

logger.info("Running connected components...")
structure = np.ones((3, 3), dtype=int)
labelled, n_components = label(mask, structure=structure)

valid_sites = []
for component_id in range(1, n_components + 1):
    comp_mask = (labelled == component_id)
    pixel_count = np.sum(comp_mask)
    if pixel_count >= min_pixels:
        valid_sites.append((component_id, pixel_count, comp_mask))

logger.info(f"Found {len(valid_sites)} candidate sites. Extracting geometries...")

site_features = []
transform = meta['transform']

for idx, (cid, count, comp_mask) in enumerate(valid_sites):
    # Get geometry
    geoms = list(shapes(comp_mask.astype(np.uint8), mask=comp_mask, transform=transform))
    if not geoms: continue
    
    geom, val = geoms[0]
    poly = Polygon(geom['coordinates'][0])
    
    area_ha = (count * res * res) / 10000.0
    
    site_features.append({
        'site_id': idx + 1,
        'geometry': poly,
        'candidate_area_ha': area_ha,
        'mean_slope': float(np.nanmean(slope[comp_mask])),
        'mcda_score': 1.0 # placeholder
    })

gdf = gpd.GeoDataFrame(site_features, crs=meta['crs'])
if not gdf.empty:
    gdf = gdf.sort_values('candidate_area_ha', ascending=False).reset_index(drop=True)
    gdf['rank'] = gdf.index + 1
    gdf_wgs84 = gdf.to_crs("EPSG:4326")
    gdf_wgs84.to_file(OUTPUT_DIR / "sites.geojson", driver="GeoJSON")
    gdf.drop(columns=['geometry']).to_csv(OUTPUT_DIR / "sites.csv", index=False)
    
    with open(OUTPUT_DIR / "site_explanations.json", "w") as f:
        json.dump([{"site_id": int(r['site_id']), "explanation": "Site meets 50 acre requirement and all hard constraints."} for _, r in gdf.iterrows()], f)
        
    logger.info(f"Saved {len(valid_sites)} sites.")
else:
    logger.warning("No sites met the criteria.")
