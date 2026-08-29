import os
import base64
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

files = {
    "src/__init__.py": "",
    "src/main.py": """
from fastapi import FastAPI
from src.api.routes import router

app = FastAPI(title="Infrastructure Intelligence Platform")
app.include_router(router)

@app.get("/health")
def health():
    return {"status": "ok"}
""",
    "src/api/__init__.py": "",
    "src/api/routes.py": """
from fastapi import APIRouter, HTTPException
from src.models.schemas import CorridorRequest, SiteRequest
from src.corridor.planner import run_corridor_planner
from src.site.finder import run_site_finder

router = APIRouter()

@router.post("/project")
def create_project():
    return {"status": "Project initialized", "message": "Using local workspace"}

@router.post("/corridor/plan")
def plan_corridor(req: CorridorRequest):
    try:
        return run_corridor_planner(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/site/find")
def find_site(req: SiteRequest):
    try:
        return run_site_finder(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
""",
    "src/models/__init__.py": "",
    "src/models/schemas.py": """
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class PointConfig(BaseModel):
    name: str
    lon: float
    lat: float

class CorridorRequest(BaseModel):
    infrastructure_type: str
    origin: PointConfig
    destination: PointConfig
    corridor_width_m: float
    profile: Optional[Dict[str, Any]] = None
    n_routes: int = 3

class ProximityConstraints(BaseModel):
    max_dist_to_highway_m: float
    max_slope_deg: float

class SiteRequest(BaseModel):
    facility_type: str
    required_area_m2: float
    proximity_constraints: ProximityConstraints
""",
    "src/scoring/__init__.py": "",
    "src/scoring/mcda.py": """
import numpy as np

def run_mcda(candidates, metrics_config):
    # metrics_config: dict of metric_name -> {'weight': float, 'minimize': bool}
    
    # 1. Extract values
    metric_names = list(metrics_config.keys())
    raw_values = {m: [] for m in metric_names}
    for c in candidates:
        for m in metric_names:
            raw_values[m].append(c['metrics'].get(m, 0.0))
            
    # 2. Normalize
    normalized_values = {m: [] for m in metric_names}
    for m in metric_names:
        vals = np.array(raw_values[m], dtype=float)
        v_min = np.nanmin(vals) if len(vals) > 0 else 0
        v_max = np.nanmax(vals) if len(vals) > 0 else 0
        
        # Avoid division by zero
        if v_max == v_min:
            norm_vals = np.ones_like(vals)
        else:
            if metrics_config[m]['minimize']:
                norm_vals = (v_max - vals) / (v_max - v_min)
            else:
                norm_vals = (vals - v_min) / (v_max - v_min)
        normalized_values[m] = norm_vals.tolist()
        
    # 3. Calculate scores
    for i, c in enumerate(candidates):
        score = 0.0
        contributions = {}
        norm_metrics = {}
        for m in metric_names:
            weight = metrics_config[m]['weight']
            n_val = normalized_values[m][i]
            contrib = n_val * weight
            score += contrib
            contributions[m] = float(contrib)
            norm_metrics[m] = float(n_val)
            
        c['mcda_score'] = float(score)
        c['normalized_metrics'] = norm_metrics
        c['weighted_contributions'] = contributions
        
    # Sort candidates by score (descending, since we inverted minimize metrics)
    candidates.sort(key=lambda x: x['mcda_score'], reverse=True)
    
    for i, c in enumerate(candidates):
        c['rank'] = i + 1
        
    return candidates
""",
    "src/corridor/__init__.py": "",
    "src/corridor/planner.py": """
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
from src.scoring.mcda import run_mcda
import pyproj
from scipy.ndimage import distance_transform_edt

logger = logging.getLogger(__name__)
BASE_DIR = Path(rstr(Path(__file__).resolve().parent.parent.parent))
COST_DIR = BASE_DIR / "data/processed/cost_components"
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def read_raster(path):
    with rasterio.open(path) as src:
        return src.read(1), src.meta.copy()

def get_cost_surface():
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
    
    return cost, meta, slope, pop, build, lc, rivers, afi

def apply_route_penalty(cost_matrix, route_pixels, iteration):
    penalty = np.zeros_like(cost_matrix)
    sigma = 10.0
    A = 0.2 * iteration
    route_mask = np.ones_like(cost_matrix)
    for r, c in route_pixels:
        route_mask[r, c] = 0
    dist = distance_transform_edt(route_mask)
    penalty = A * np.exp(-(dist**2)/(2*sigma**2))
    return cost_matrix + penalty

def run_corridor_planner(req):
    cost_surf, meta, slope, pop, build, lc, rivers, afi = get_cost_surface()
    res = meta['transform'][0]
    
    transformer = pyproj.Transformer.from_crs("EPSG:4326", meta['crs'], always_xy=True)
    o_x, o_y = transformer.transform(req.origin.lon, req.origin.lat)
    d_x, d_y = transformer.transform(req.destination.lon, req.destination.lat)
    
    with rasterio.open(OUTPUT_DIR / "route_cost_surface.tif", 'w', **meta) as dst:
        pass # use just for index, or save it
        
    # We need index mapping
    transform = meta['transform']
    o_col, o_row = ~transform * (o_x, o_y)
    d_col, d_row = ~transform * (d_x, d_y)
    o_col, o_row, d_col, d_row = int(o_col), int(o_row), int(d_col), int(d_row)

    if not (0 <= o_row < cost_surf.shape[0] and 0 <= o_col < cost_surf.shape[1]):
        raise ValueError("Origin out of bounds")
    if not (0 <= d_row < cost_surf.shape[0] and 0 <= d_col < cost_surf.shape[1]):
        raise ValueError("Destination out of bounds")

    candidates = []
    current_cost = cost_surf.copy()

    for i in range(req.n_routes):
        mcp = MCP_Geometric(current_cost, fully_connected=True)
        try:
            cumcost, traceback = mcp.find_costs([(o_row, o_col)])
            path_pixels = mcp.traceback((d_row, d_col))
        except ValueError:
            break
            
        path_coords = [transform * (c, r) for (r, c) in path_pixels]
        line = LineString(path_coords)
        
        # Extract Real Metrics for the path
        path_r = [p[0] for p in path_pixels]
        path_c = [p[1] for p in path_pixels]
        
        path_slope = slope[path_r, path_c]
        path_pop = pop[path_r, path_c]
        path_afi = afi[path_r, path_c]
        path_build = build[path_r, path_c]
        
        metrics = {
            'route_length_km': line.length / 1000.0,
            'mean_slope': float(np.nanmean(path_slope)),
            'population_exposure': float(np.nansum(path_pop)),
            'building_density': float(np.nanmean(path_build)),
            'acquisition_friction_index': float(np.nanmean(path_afi))
        }
        
        candidates.append({
            'route_id': i + 1,
            'geometry': line,
            'metrics': metrics,
            'corridor_width_m': req.corridor_width_m,
            'pixels': path_pixels
        })
        current_cost = apply_route_penalty(current_cost, path_pixels, i+1)

    # Run real MCDA
    mcda_config = {
        'route_length_km': {'weight': 0.3, 'minimize': True},
        'mean_slope': {'weight': 0.2, 'minimize': True},
        'population_exposure': {'weight': 0.2, 'minimize': True},
        'building_density': {'weight': 0.1, 'minimize': True},
        'acquisition_friction_index': {'weight': 0.2, 'minimize': True},
    }
    candidates = run_mcda(candidates, mcda_config)
    
    # Generate explanations
    for c in candidates:
        reasons = []
        best_metric = max(c['weighted_contributions'].items(), key=lambda x: x[1])[0]
        reasons.append(f"Strongest scoring factor is {best_metric} (Contribution: {c['weighted_contributions'][best_metric]:.2f}).")
        reasons.append(f"Total length is {c['metrics']['route_length_km']:.2f} km.")
        reasons.append(f"Average terrain slope is {c['metrics']['mean_slope']:.2f} degrees.")
        c['reasons'] = reasons

    # Save outputs
    gdf = gpd.GeoDataFrame(candidates, crs=meta['crs'])
    gdf_wgs84 = gdf.to_crs("EPSG:4326")
    output_routes = []
    for idx, row in gdf_wgs84.iterrows():
        c = candidates[idx]
        output_routes.append({
            "type": "Feature",
            "geometry": row.geometry.__geo_interface__,
            "properties": {
                "route_id": c['route_id'],
                "rank": c['rank'],
                "mcda_score": c['mcda_score'],
                "metrics": c['metrics'],
                "reasons": c['reasons']
            }
        })
        
    feature_collection = {"type": "FeatureCollection", "features": output_routes}
    with open(OUTPUT_DIR / "routes.geojson", "w") as f:
        json.dump(feature_collection, f)
        
    return {"status": "success", "routes": len(candidates), "data": candidates}
""",
    "src/site/__init__.py": "",
    "src/site/finder.py": """
import os
import numpy as np
import rasterio
import geopandas as gpd
from shapely.geometry import Polygon
import json
import logging
from pathlib import Path
from scipy.ndimage import label
from rasterio.features import shapes
from src.scoring.mcda import run_mcda

logger = logging.getLogger(__name__)
BASE_DIR = Path(rstr(Path(__file__).resolve().parent.parent.parent))
COST_DIR = BASE_DIR / "data/processed/cost_components"
OUTPUT_DIR = BASE_DIR / "outputs"

def read_raster(path):
    with rasterio.open(path) as src:
        return src.read(1), src.meta.copy()

def run_site_finder(req):
    slope, meta = read_raster(COST_DIR / "slope.tif")
    lc, _ = read_raster(COST_DIR / "land_cover.tif")
    water_occ, _ = read_raster(COST_DIR / "water_occurrence.tif")
    dist_highway, _ = read_raster(COST_DIR / "dist_to_highway.tif")
    pop, _ = read_raster(COST_DIR / "population.tif")
    afi, _ = read_raster(COST_DIR / "acquisition_friction_index.tif")

    res = meta['transform'][0]
    req_area_m2 = req.required_area_m2
    min_pixels = int(np.ceil(req_area_m2 / (res * res)))
    max_dist_hwy = req.proximity_constraints.max_dist_to_highway_m
    max_slope = req.proximity_constraints.max_slope_deg

    mask = np.ones_like(slope, dtype=np.uint8)

    # Hard Constraints
    mask[water_occ >= 50] = 0
    mask[lc == 50] = 0 
    mask[lc == 80] = 0 
    mask[slope > max_slope] = 0
    mask[dist_highway > max_dist_hwy] = 0
    mask[np.isnan(slope)] = 0

    structure = np.ones((3, 3), dtype=int)
    labelled, n_components = label(mask, structure=structure)

    valid_sites = []
    for component_id in range(1, n_components + 1):
        comp_mask = (labelled == component_id)
        pixel_count = np.sum(comp_mask)
        if pixel_count >= min_pixels:
            valid_sites.append((component_id, pixel_count, comp_mask))

    candidates = []
    transform = meta['transform']

    for idx, (cid, count, comp_mask) in enumerate(valid_sites):
        geoms = list(shapes(comp_mask.astype(np.uint8), mask=comp_mask, transform=transform))
        if not geoms: continue
        
        geom, val = geoms[0]
        poly = Polygon(geom['coordinates'][0])
        
        area_ha = (count * res * res) / 10000.0
        
        metrics = {
            'candidate_area_ha': area_ha,
            'mean_slope': float(np.nanmean(slope[comp_mask])),
            'population_exposure': float(np.nansum(pop[comp_mask])),
            'mean_distance_to_highway': float(np.nanmean(dist_highway[comp_mask])),
            'acquisition_friction_index': float(np.nanmean(afi[comp_mask]))
        }
        
        candidates.append({
            'site_id': idx + 1,
            'geometry': poly,
            'metrics': metrics
        })

    # MCDA
    mcda_config = {
        'candidate_area_ha': {'weight': 0.3, 'minimize': False},
        'mean_slope': {'weight': 0.2, 'minimize': True},
        'population_exposure': {'weight': 0.1, 'minimize': True},
        'mean_distance_to_highway': {'weight': 0.2, 'minimize': True},
        'acquisition_friction_index': {'weight': 0.2, 'minimize': True}
    }
    candidates = run_mcda(candidates, mcda_config)

    for c in candidates:
        reasons = []
        reasons.append(f"Site area is {c['metrics']['candidate_area_ha']:.2f} ha (meets {req_area_m2/10000.0} ha requirement).")
        best_metric = max(c['weighted_contributions'].items(), key=lambda x: x[1])[0]
        reasons.append(f"Strongest scoring factor is {best_metric} (Contribution: {c['weighted_contributions'][best_metric]:.2f}).")
        c['reasons'] = reasons

    gdf = gpd.GeoDataFrame(candidates, crs=meta['crs'])
    if not gdf.empty:
        gdf_wgs84 = gdf.to_crs("EPSG:4326")
        output_sites = []
        for idx, row in gdf_wgs84.iterrows():
            c = candidates[idx]
            output_sites.append({
                "type": "Feature",
                "geometry": row.geometry.__geo_interface__,
                "properties": {
                    "site_id": c['site_id'],
                    "rank": c['rank'],
                    "mcda_score": c['mcda_score'],
                    "metrics": c['metrics'],
                    "reasons": c['reasons']
                }
            })
            
        feature_collection = {"type": "FeatureCollection", "features": output_sites}
        with open(OUTPUT_DIR / "sites.geojson", "w") as f:
            json.dump(feature_collection, f)
            
    return {"status": "success", "sites": len(candidates), "data": candidates}
""",
    "tests/test_api.py": """
import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200

def test_project():
    response = client.post("/project")
    assert response.status_code == 200

def test_corridor_plan():
    req = {
        "infrastructure_type": "highway",
        "origin": {"name": "Latur", "lon": 76.57, "lat": 18.40},
        "destination": {"name": "Osmanabad", "lon": 76.04, "lat": 18.18},
        "corridor_width_m": 50,
        "n_routes": 2
    }
    response = client.post("/corridor/plan", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "routes" in data
    assert data["routes"] > 0
    # verify mcda score exists
    assert "mcda_score" in data["data"][0]

def test_site_find():
    req = {
        "facility_type": "factory",
        "required_area_m2": 202343,
        "proximity_constraints": {
            "max_dist_to_highway_m": 5000,
            "max_slope_deg": 10
        }
    }
    response = client.post("/site/find", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "sites" in data
    if data["sites"] > 0:
        assert "mcda_score" in data["data"][0]
"""
}

for filepath, content in files.items():
    p = BASE_DIR / filepath
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content.strip())

print("Backend source tree built successfully.")
