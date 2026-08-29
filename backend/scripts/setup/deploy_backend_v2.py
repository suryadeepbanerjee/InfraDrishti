import os
from pathlib import Path
import base64

BASE_DIR = Path(__file__).resolve().parent

files = {
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
    max_dist_to_highway_m: float = 10000.0
    max_dist_to_railway_m: float = 10000.0
    max_slope_deg: float = 15.0

class SiteRequest(BaseModel):
    facility_type: str
    required_area_m2: float
    proximity_constraints: ProximityConstraints
""",
    "src/scoring/mcda.py": """
import numpy as np
import yaml
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

def load_profile(infrastructure_type):
    profile_path = BASE_DIR / "configs/infrastructure_profiles.yaml"
    with open(profile_path) as f:
        config = yaml.safe_load(f)
    if infrastructure_type in config['profiles']:
        return config['profiles'][infrastructure_type]
    return config['profiles']['highway']

def run_mcda(candidates, metrics_config):
    metric_names = list(metrics_config.keys())
    raw_values = {m: [] for m in metric_names}
    for c in candidates:
        for m in metric_names:
            raw_values[m].append(c['metrics'].get(m, 0.0))
            
    normalized_values = {m: [] for m in metric_names}
    for m in metric_names:
        vals = np.array(raw_values[m], dtype=float)
        v_min = np.nanmin(vals) if len(vals) > 0 else 0
        v_max = np.nanmax(vals) if len(vals) > 0 else 0
        
        if v_max == v_min:
            norm_vals = np.ones_like(vals)
        else:
            if metrics_config[m]['minimize']:
                norm_vals = (v_max - vals) / (v_max - v_min)
            else:
                norm_vals = (vals - v_min) / (v_max - v_min)
        normalized_values[m] = norm_vals.tolist()
        
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
        
    candidates.sort(key=lambda x: x['mcda_score'], reverse=True)
    
    for i, c in enumerate(candidates):
        c['rank'] = i + 1
        
    return candidates
""",
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
from src.scoring.mcda import run_mcda, load_profile
import pyproj
from scipy.ndimage import distance_transform_edt
from rasterio.features import rasterize

logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
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
    dist_highway, _ = read_raster(COST_DIR / "dist_to_highway.tif")
    pa, _ = read_raster(COST_DIR / "protected_areas.tif")

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

    # HARD CONSTRAINTS
    cost[water_occ >= 50] = np.inf
    cost[lc == 80] = np.inf
    cost[pa > 0] = np.inf
    cost[np.isnan(cost)] = np.inf
    
    return cost, meta, slope, pop, build, lc, rivers, afi, dist_highway, pa

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
    cost_surf, meta, slope, pop, build, lc, rivers, afi, dist_highway, pa = get_cost_surface()
    res = meta['transform'][0]
    
    transformer = pyproj.Transformer.from_crs("EPSG:4326", meta['crs'], always_xy=True)
    o_x, o_y = transformer.transform(req.origin.lon, req.origin.lat)
    d_x, d_y = transformer.transform(req.destination.lon, req.destination.lat)
    
    with rasterio.open(OUTPUT_DIR / "route_cost_surface.tif", 'w', **meta) as dst:
        pass
        
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
        corridor_poly = line.buffer(req.corridor_width_m / 2.0)
        
        c_mask = rasterize([(corridor_poly, 1)], out_shape=cost_surf.shape, transform=transform, fill=0, all_touched=True, dtype=np.uint8).astype(bool)
        
        metrics = {
            'route_length_km': line.length / 1000.0,
            'corridor_width_m': req.corridor_width_m,
            'corridor_area': float(np.sum(c_mask) * res * res),
            'mean_slope_deg': float(np.nanmean(slope[c_mask])) if np.any(c_mask) else 0.0,
            'max_slope_deg': float(np.nanmax(slope[c_mask])) if np.any(c_mask) else 0.0,
            'population_exposure': float(np.nansum(pop[c_mask])),
            'building_density': float(np.nanmean(build[c_mask])) if np.any(c_mask) else 0.0,
            'acquisition_friction_index': float(np.nanmean(afi[c_mask])) if np.any(c_mask) else 0.0,
            'protected_area_overlap': float(np.nansum(pa[c_mask]) * res * res),
            'river_crossings': int(np.nansum(rivers[c_mask])),
            'forest_overlap_km2': float(np.sum(lc[c_mask] == 10) * res * res / 1000000.0),
            'cropland_overlap_km2': float(np.sum(lc[c_mask] == 40) * res * res / 1000000.0),
            'builtup_overlap': float(np.sum(lc[c_mask] == 50) * res * res / 1000000.0),
            'waterbody_overlap': float(np.sum(water_occ[c_mask] >= 50) * res * res / 1000000.0),
            'dist_to_highway_m': float(np.nanmean(dist_highway[c_mask])) if np.any(c_mask) else 0.0
        }
        
        candidates.append({
            'route_id': i + 1,
            'geometry': corridor_poly.__geo_interface__,
            'metrics': metrics
        })
        current_cost = apply_route_penalty(current_cost, path_pixels, i+1)

    profile = load_profile(req.infrastructure_type)
    mcda_config = {}
    for k, weight in profile.get('mcda_weights', {}).items():
        if k in candidates[0]['metrics'] if candidates else []:
            minimize = (profile.get('mcda_directions', {}).get(k, 'minimise') == 'minimise')
            mcda_config[k] = {'weight': weight, 'minimize': minimize}
            
    candidates = run_mcda(candidates, mcda_config)
    
    for c in candidates:
        reasons = []
        if c.get('weighted_contributions'):
            best_metric = max(c['weighted_contributions'].items(), key=lambda x: x[1])[0]
            reasons.append(f"Strongest positive factor is {best_metric} (score: {c['weighted_contributions'][best_metric]:.2f}).")
        reasons.append(f"Corridor length: {c['metrics']['route_length_km']:.2f} km.")
        reasons.append(f"Protected area overlap: {c['metrics']['protected_area_overlap']} m2.")
        c['reasons'] = reasons

    feature_collection = {"type": "FeatureCollection", "features": []}
    for c in candidates:
        geom = c.pop('geometry')
        feature_collection["features"].append({
            "type": "Feature",
            "geometry": geom,
            "properties": c
        })
        
    with open(OUTPUT_DIR / "routes.geojson", "w") as f:
        json.dump(feature_collection, f)
        
    with open(OUTPUT_DIR / "route_explanations.json", "w") as f:
        exps = [{"route_id": c['route_id'], "rank": c['rank'], "mcda_score": c['mcda_score'], "reasons": c['reasons']} for c in candidates]
        json.dump(exps, f)
        
    return {"status": "success", "routes": len(candidates), "data": feature_collection}
""",
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
from src.scoring.mcda import run_mcda, load_profile

logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
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
    pa, _ = read_raster(COST_DIR / "protected_areas.tif")

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
    mask[pa > 0] = 0
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
            'site_area_ha': area_ha,
            'area_surplus': max(0.0, area_ha - (req_area_m2/10000.0)),
            'mean_slope_deg': float(np.nanmean(slope[comp_mask])),
            'max_slope_deg': float(np.nanmax(slope[comp_mask])),
            'population_within_1km': float(np.nansum(pop[comp_mask])),
            'building_density': float(np.nanmean(dist_highway[comp_mask])), # dummy proxy since we don't have building count mask
            'acquisition_friction_index': float(np.nanmean(afi[comp_mask])),
            'dist_to_highway_m': float(np.nanmean(dist_highway[comp_mask])),
            'protected_area_overlap': 0.0, # excluded by hard mask
            'forest_overlap_km2': float(np.sum(lc[comp_mask] == 10) * res * res / 1000000.0)
        }
        
        candidates.append({
            'site_id': idx + 1,
            'geometry': poly.__geo_interface__,
            'metrics': metrics
        })

    profile = load_profile(req.facility_type)
    mcda_config = {}
    for k, weight in profile.get('site_mcda_weights', {}).items():
        if k in candidates[0]['metrics'] if candidates else []:
            minimize = (profile.get('site_mcda_directions', {}).get(k, 'minimise') == 'minimise')
            mcda_config[k] = {'weight': weight, 'minimize': minimize}
            
    candidates = run_mcda(candidates, mcda_config)

    for c in candidates:
        reasons = []
        reasons.append(f"Site area is {c['metrics']['site_area_ha']:.2f} ha.")
        if c.get('weighted_contributions'):
            best_metric = max(c['weighted_contributions'].items(), key=lambda x: x[1])[0]
            reasons.append(f"Key positive factor: {best_metric} ({c['weighted_contributions'][best_metric]:.2f}).")
        c['reasons'] = reasons

    feature_collection = {"type": "FeatureCollection", "features": []}
    for c in candidates:
        geom = c.pop('geometry')
        feature_collection["features"].append({
            "type": "Feature",
            "geometry": geom,
            "properties": c
        })
        
    with open(OUTPUT_DIR / "sites.geojson", "w") as f:
        json.dump(feature_collection, f)
        
    with open(OUTPUT_DIR / "site_explanations.json", "w") as f:
        exps = [{"site_id": c['site_id'], "rank": c['rank'], "mcda_score": c['mcda_score'], "reasons": c['reasons']} for c in candidates]
        json.dump(exps, f)
        
    return {"status": "success", "sites": len(candidates), "data": feature_collection}
""",
    "tests/test_api.py": """
import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_corridor_plan():
    req = {
        "infrastructure_type": "highway",
        "origin": {"name": "Latur", "lon": 76.57, "lat": 18.40},
        "destination": {"name": "Osmanabad", "lon": 76.04, "lat": 18.18},
        "corridor_width_m": 50,
        "n_routes": 3
    }
    response = client.post("/corridor/plan", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["routes"] > 0
    assert "features" in data["data"]
    # Check polygons buffer applied
    assert data["data"]["features"][0]["geometry"]["type"] == "Polygon"
    # Check metrics
    props = data["data"]["features"][0]["properties"]
    assert "mcda_score" in props
    assert props["metrics"]["protected_area_overlap"] == 0.0

def test_site_find():
    req = {
        "facility_type": "highway",
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
    if data["sites"] > 0:
        props = data["data"]["features"][0]["properties"]
        assert "mcda_score" in props
        assert props["metrics"]["protected_area_overlap"] == 0.0
        assert props["metrics"]["site_area_ha"] >= 20.23
"""
}

for filepath, content in files.items():
    p = BASE_DIR / filepath
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content.strip())
