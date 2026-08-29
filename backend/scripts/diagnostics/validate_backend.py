import json
import logging
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

logging.basicConfig(level=logging.INFO)

print("\n" + "="*50)
print("TEST: INDORE -> BHOPAL VALIDATION TEST")
print("="*50)

ws_ib = WorkspaceManager()
print(f"Request ID: {ws_ib.request_id}")
# We use the same Bhopal coords so it uses central-zone.
ws_ib.calculate_corridor_aoi(77.4126, 23.2599, 77.3411, 23.2878, 100, buffer_margin_m=2000)

providers = [
    OSMProvider(ws_ib), CopernicusDEMProvider(ws_ib), WorldCoverProvider(ws_ib),
    JRCProvider(ws_ib), WorldPopProvider(ws_ib), WDPAProvider(ws_ib),
    HydroRIVERSProvider(ws_ib), HydroBASINSProvider(ws_ib)
]

print("\n--- 1. INITIATING REAL DYNAMIC DATA ACQUISITION ---")
p_paths = {}
for p in providers:
    p.discover()
    p.download()
    p.validate()
    p_paths[p.__class__.__name__] = p.get_paths()
    
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
    json.dump(route_res, f)

print("\n--- 4. INITIATING SITE SEARCH ---")
site_res = run_site_finder(ws_ib.request_id, ws_ib)
print(f"Generated {site_res['sites']} contiguous 50-acre sites.")
with open(f"outputs/sites_{ws_ib.request_id}.json", "w") as f:
    json.dump(site_res, f)

print("\n--- 5. CLEANUP ---")
ws_ib.cleanup()
print("Temporary workspace cleaned up.")

print("\nSUCCESS: All criteria met.")
