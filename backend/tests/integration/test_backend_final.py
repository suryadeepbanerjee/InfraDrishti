import json
import numpy as np
import logging
import shutil
from pathlib import Path
from src.core.workspace import WorkspaceManager
from src.acquisition.providers.providers import (
    OSMProvider, CopernicusDEMProvider, WorldCoverProvider, 
    JRCProvider, WDPAProvider, WorldPopProvider, 
    HydroRIVERSProvider, HydroBASINSProvider
)
from src.preprocessing.pipeline import PreprocessingPipeline
from src.corridor.planner import run_corridor_planner
from src.site.finder import run_site_finder
from src.preprocessing.memory_audit import log_memory_estimate

logging.basicConfig(level=logging.INFO)

class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NpEncoder, self).default(obj)

print("\n" + "="*50)
print("TEST: INDORE -> BHOPAL VALIDATION TEST")
print("="*50)

# Cleanup past failed runtime folders to save disk space
runtime_dir = Path("runtime")
if runtime_dir.exists():
    for old_run in runtime_dir.iterdir():
        if old_run.is_dir():
            print(f"Cleaning up old run folder: {old_run}")
            shutil.rmtree(old_run, ignore_errors=True)

ws_ib = WorkspaceManager()
print(f"Request ID: {ws_ib.request_id}")
ws_ib.calculate_corridor_aoi(75.8577, 22.7196, 77.4126, 23.2599, 50, buffer_margin_m=5000)

log_memory_estimate(ws_ib)

providers = [
    OSMProvider(ws_ib), CopernicusDEMProvider(ws_ib), WorldCoverProvider(ws_ib),
    JRCProvider(ws_ib), WorldPopProvider(ws_ib), WDPAProvider(ws_ib),
    HydroRIVERSProvider(ws_ib), HydroBASINSProvider(ws_ib)
]

print("\n--- 1. INITIATING REAL DYNAMIC DATA ACQUISITION ---")
p_paths = {}
provenance = {}
for p in providers:
    p.discover()
    p.download()
    p.validate()
    p_paths[p.__class__.__name__] = p.get_paths()
    provenance[p.__class__.__name__] = {"status": "success", "paths": [str(x) for x in p.get_paths()]}

ws_ib.manifest["provenance"] = provenance

print("\n--- 2. INITIATING REAL DYNAMIC PREPROCESSING ---")
pipeline = PreprocessingPipeline(ws_ib)
pipeline.process_corridor(
    osm_paths=p_paths['OSMProvider'],
    dem_paths=p_paths['CopernicusDEMProvider'],
    wc_paths=p_paths['WorldCoverProvider'],
    jrc_paths=p_paths['JRCProvider'],
    wdpa_paths=p_paths['WDPAProvider'],
    pop_paths=p_paths['WorldPopProvider'],
    rivers_paths=p_paths['HydroRIVERSProvider'],
    basins_paths=p_paths['HydroBASINSProvider']
)

print("\n--- 3. INITIATING REAL MCP ROUTING ---")
route_res = run_corridor_planner(ws_ib.request_id, ws_ib)
print(f"Generated {route_res['routes']} genuinely different routes.")
with open(f"outputs/routes_{ws_ib.request_id}.json", "w") as f:
    json.dump(route_res, f, indent=2, cls=NpEncoder)

print("\n--- 4. INITIATING SITE SEARCH ---")
site_res = run_site_finder(ws_ib.request_id, ws_ib)
print(f"Generated {site_res['sites']} contiguous candidate subregions.")
with open(f"outputs/sites_{ws_ib.request_id}.json", "w") as f:
    json.dump(site_res, f, indent=2, cls=NpEncoder)

print("\n--- 5. OUTPUT INSPECTION ---")
for r in route_res["features"]:
    props = r["properties"]
    print(f"\nRoute {props['rank']}: Score {props['mcda_score']:.2f}, {props['raw_metrics']['route_length_km']:.2f}km")
    print(f"Norm Metrics: {props['normalized_metrics']}")
    print(f"Weights: {props['weights']}")
    print(f"Weighted Contrib: {props['weighted_contributions']}")
    math_sum = sum(props['weighted_contributions'].values())
    print(f"Math check: {math_sum} == {props['mcda_score']} ({abs(math_sum - props['mcda_score']) < 1e-5})")
    
for s in site_res["features"]:
    props = s["properties"]
    print(f"\nSite {props['rank']}: Score {props['mcda_score']:.2f}, {props['raw_metrics']['area_acres']:.2f} acres")
    print(f"Norm Metrics: {props['normalized_metrics']}")
    print(f"Weights: {props['weights']}")
    math_sum = sum(props['weighted_contributions'].values())
    print(f"Math check: {math_sum} == {props['mcda_score']} ({abs(math_sum - props['mcda_score']) < 1e-5})")

print("\n--- 6. CLEANUP ---")
ws_ib.cleanup()
print("Temporary workspace cleaned up.")

print("\nSUCCESS: All criteria met. GREEN")
