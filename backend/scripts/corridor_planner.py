import os
import yaml
import numpy as np
import rasterio
from skimage.graph import MCP_Geometric
import geopandas as gpd
from shapely.geometry import LineString, Polygon
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(r"D:\Learn\B_Tech\Hackathons\1_BuildWithBharat\Prototype\Model")
COST_DIR = BASE_DIR / "data/processed/cost_components"
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

with open(BASE_DIR / "configs/aoi_config.yaml") as f:
    config = yaml.safe_load(f)

# Build Cost Surface
logger.info("Building cost surface...")
def read_raster(path):
    with rasterio.open(path) as src:
        return src.read(1), src.meta.copy()

slope, meta = read_raster(COST_DIR / "slope.tif")
pop, _ = read_raster(COST_DIR / "population.tif")
build, _ = read_raster(COST_DIR / "building_density.tif")
lc, _ = read_raster(COST_DIR / "land_cover.tif")
water_occ, _ = read_raster(COST_DIR / "water_occurrence.tif")
rivers, _ = read_raster(COST_DIR / "rivers.tif")
afi, _ = read_raster(COST_DIR / "acquisition_friction_index.tif")

cost = np.zeros_like(slope, dtype=np.float32)

slope_cost = np.clip(slope / 15.0, 0, 1)
cost += slope_cost * 0.20
cost += build.astype(np.float32) * 0.15
cost += np.clip(pop / 100.0, 0, 1) * 0.10

lc_cost = np.zeros_like(slope, dtype=np.float32)
lc_cost[lc == 10] = 0.6
lc_cost[lc == 40] = 0.4
lc_cost[lc == 50] = 0.9
cost += lc_cost * 0.15

cost += rivers.astype(np.float32) * 0.10
cost += afi * 0.20
cost += 0.05

cost[water_occ >= 50] = np.inf
cost[lc == 80] = np.inf
cost[np.isnan(cost)] = np.inf

meta.update({'dtype': 'float32', 'nodata': np.nan})
cost_surface_path = OUTPUT_DIR / "route_cost_surface.tif"
with rasterio.open(cost_surface_path, 'w', **meta) as dst:
    dst.write(cost, 1)

logger.info("Cost surface saved.")

logger.info("Running MCP_Geometric for route generation...")
origin = config['corridor_demo']['origin']
dest = config['corridor_demo']['destination']
n_routes = config['corridor_demo']['n_routes']
corridor_width = config['corridor_demo']['corridor_width_m']
res = meta['transform'][0]

with rasterio.open(cost_surface_path) as src:
    cost_surf = src.read(1)
    import pyproj
    transformer = pyproj.Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
    o_x, o_y = transformer.transform(origin['lon'], origin['lat'])
    d_x, d_y = transformer.transform(dest['lon'], dest['lat'])
    o_row, o_col = src.index(o_x, o_y)
    d_row, d_col = src.index(d_x, d_y)

def apply_route_penalty(cost_matrix, route_pixels, iteration, res):
    penalty = np.zeros_like(cost_matrix)
    sigma = 10.0
    A = 0.2 * iteration
    route_mask = np.ones_like(cost_matrix)
    for r, c in route_pixels:
        route_mask[r, c] = 0
    from scipy.ndimage import distance_transform_edt
    dist = distance_transform_edt(route_mask)
    penalty = A * np.exp(-(dist**2)/(2*sigma**2))
    return cost_matrix + penalty

routes = []
current_cost = cost_surf.copy()

for i in range(n_routes):
    logger.info(f"Generating route {i+1}...")
    mcp = MCP_Geometric(current_cost, fully_connected=True)
    try:
        cumcost, traceback = mcp.find_costs([(o_row, o_col)])
        path_pixels = mcp.traceback((d_row, d_col))
    except ValueError:
        logger.warning(f"Could not find route {i+1} - no valid path.")
        break
    path_coords = [src.xy(r, c) for (r, c) in path_pixels]
    line = LineString(path_coords)
    score = cumcost[d_row, d_col] / len(path_pixels)
    routes.append({
        'route_id': i + 1,
        'geometry': line,
        'mcda_score': float(score),
        'route_length_km': line.length / 1000.0,
        'corridor_width_m': corridor_width
    })
    current_cost = apply_route_penalty(current_cost, path_pixels, i+1, res)

gdf = gpd.GeoDataFrame(routes, crs=src.crs)
gdf = gdf.sort_values('mcda_score').reset_index(drop=True)
gdf['rank'] = gdf.index + 1
gdf_wgs84 = gdf.to_crs("EPSG:4326")
gdf_wgs84.to_file(OUTPUT_DIR / "routes.geojson", driver="GeoJSON")
gdf.drop(columns=['geometry']).to_csv(OUTPUT_DIR / "routes.csv", index=False)
logger.info(f"Generated {len(routes)} routes.")

with open(OUTPUT_DIR / "route_explanations.json", "w") as f:
    json.dump([{"route_id": int(r['route_id']), "explanation": "Generated via deterministic MCP_Geometric with spatial penalty."} for r in routes], f)
