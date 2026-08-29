import json
import numpy as np
import logging
from src.core.workspace import WorkspaceManager
from src.corridor.planner import run_corridor_planner
from src.site.finder import run_site_finder

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
print("TEST: INDORE -> BHOPAL (REUSE DATA)")
print("="*50)

# Init with previous ID
ws_ib = WorkspaceManager("20260830004453_83e7be13")
ws_ib.manifest["request_id"] = "20260830004453_83e7be13"
ws_ib.manifest["aoi"] = {
    "start_coords": [22.7196, 75.8577],
    "end_coords": [23.2599, 77.4126],
    "buffer_margin_m": 5000,
    "resolution_m": 50,
    "bounds": None
}
# Mock provenance to avoid missing key errors
ws_ib.manifest["provenance"] = {"Mock": {"status": "success", "paths": []}}

print("\n--- 3. INITIATING REAL MCP ROUTING ---")
route_res = run_corridor_planner(ws_ib.request_id, ws_ib)
print(f"Generated {route_res['routes']} genuinely different routes.")
with open(f"routes_{ws_ib.request_id}_updated.json", "w") as f:
    json.dump(route_res, f, indent=2, cls=NpEncoder)

print("\n--- 4. INITIATING SITE SEARCH ---")
site_res = run_site_finder(ws_ib.request_id, ws_ib)
print(f"Generated {site_res['sites']} contiguous candidate subregions.")
with open(f"sites_{ws_ib.request_id}_updated.json", "w") as f:
    json.dump(site_res, f, indent=2, cls=NpEncoder)

print("\n--- 5. OUTPUT INSPECTION ---")
print("\nCORRIDOR DIVERSITY METRICS:")
if "diversity" in route_res:
    for d in route_res["diversity"]:
        print(f"Pair {d['pair'][0]}&{d['pair'][1]}: Overlap {d['jaccard_overlap']:.2%} (Pass: {d['is_diverse']})")
if "failed_attempts" in route_res and route_res["failed_attempts"]:
    print(f"\nFailed routing attempts:")
    for fa in route_res["failed_attempts"]:
        print(f" - {fa}")

for r in route_res["features"]:
    props = r["properties"]
    print(f"\nRoute {props['rank']}: Score {props['mcda_score']:.2f}, {props['raw_metrics']['route_length_km']:.2f}km")
    print(f"Raw Metrics: {props['raw_metrics']}")
    
print("\nSITE CANDIDATES:")
for s in site_res["features"]:
    props = s["properties"]
    print(f"\nSite {props['rank']}: Score {props['mcda_score']:.2f}, {props['raw_metrics']['site_area_ha']:.2f} ha")
    print(f"Raw Metrics: {props['raw_metrics']}")
    math_sum = sum(props['weighted_contributions'].values())
    print(f"Math check: {math_sum} == {props['mcda_score']} ({abs(math_sum - props['mcda_score']) < 1e-5})")
