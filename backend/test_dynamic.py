import json
import logging
from src.core.workspace import WorkspaceManager, WorkspaceLimitError
from src.acquisition.providers.providers import (
    OSMProvider, CopernicusDEMProvider, WorldCoverProvider, 
    JRCProvider, WDPAProvider, WorldPopProvider, 
    HydroRIVERSProvider, HydroBASINSProvider, DataCoverageError
)
from src.preprocessing.pipeline import PreprocessingPipeline
from src.corridor.planner import run_corridor_planner

logging.basicConfig(level=logging.INFO)

print("\n" + "="*50)
print("TEST: BHOPAL E2E REAL TEST (Bhopal Junction -> Airport)")
print("="*50)

ws_ib = None
try:
    ws_ib = WorkspaceManager()
    print(f"Request ID: {ws_ib.request_id}")
    # Bhopal Junction -> Airport (approx 10km)
    ws_ib.calculate_corridor_aoi(77.4126, 23.2599, 77.3411, 23.2878, 100, buffer_margin_m=2000)
    
    providers = [
        OSMProvider(ws_ib), CopernicusDEMProvider(ws_ib), WorldCoverProvider(ws_ib),
        JRCProvider(ws_ib), WorldPopProvider(ws_ib), WDPAProvider(ws_ib),
        HydroRIVERSProvider(ws_ib), HydroBASINSProvider(ws_ib)
    ]
    
    print("\n--- INITIATING REAL DYNAMIC DATA ACQUISITION ---")
    p_paths = {}
    for p in providers:
        p.discover()
        p.download()
        p.validate()
        p_paths[p.__class__.__name__] = p.get_paths()
        
    print("\n--- INITIATING REAL DYNAMIC PREPROCESSING ---")
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
    
    print("\n--- INITIATING REAL MCP ROUTING ---")
    results = run_corridor_planner(ws_ib.request_id, ws_ib)
    print(f"Generated {results['routes']} routes.")
    
    print("\nSUCCESS: Real End-to-End Pipeline executed successfully!")
    
except WorkspaceLimitError as e:
    print(f"\n[BLOCKED] Workspace Limit Exceeded:\n{e}")
except DataCoverageError as e:
    print(f"\n[BLOCKED] Coverage Error:\n{e}")
except Exception as e:
    print(f"\n[ERROR] Pipeline Error:\n{e}")
finally:
    if ws_ib:
        print("\nCleaning up temporary workspace...")
        ws_ib.cleanup()
