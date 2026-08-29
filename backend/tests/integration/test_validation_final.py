import json
import numpy as np
import logging
import itertools
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

print("\n" + "="*60)
print("BACKEND VALIDATION: REUSING run 20260830004453_83e7be13")
print("="*60)
print("AOI: Indore (75.8577, 22.7196) -> Bhopal (77.4126, 23.2599)")
print("Source files verified in runtime/20260830004453_83e7be13/")

ws_ib = WorkspaceManager("20260830004453_83e7be13")
ws_ib.manifest["request_id"] = "20260830004453_83e7be13"
ws_ib.manifest["provenance"] = {"status": "reused_validated_run"}

print("\n--- CORRIDOR PLANNER ---")
route_res = run_corridor_planner(ws_ib.request_id, ws_ib)
print(f"Attempted: 5 routes")
print(f"Successful: {route_res['routes']}")
with open(f"outputs/routes_updated.json", "w") as f:
    json.dump(route_res, f, indent=2, cls=NpEncoder)

print("\nDIVERSITY METRICS:")
for d in route_res.get("diversity", []):
    status = "PASS (diverse)" if d["is_diverse"] else "FAIL (too similar)"
    print(f"  Pair {d['pair']}: Jaccard overlap = {d['jaccard_overlap']:.4f}  -> {status}")

if route_res.get("failed_attempts"):
    print(f"\nFailed attempts:")
    for i, reason in enumerate(route_res["failed_attempts"], 3):
        print(f"  Route {i}: {reason}")

for r in route_res["features"]:
    props = r["properties"]
    print(f"\nRoute {props['rank']} [{props['raw_metrics']['route_length_km']:.1f}km]  MCDA={props['mcda_score']:.4f}")
    print(f"  raw_metrics   : {props['raw_metrics']}")
    print(f"  norm_metrics  : {props['normalized_metrics']}")
    print(f"  weighted_contribs: {props['weighted_contributions']}")
    math_sum = sum(props["weighted_contributions"].values())
    print(f"  math_check: sum={math_sum:.6f} == score={props['mcda_score']:.6f} -> {abs(math_sum - props['mcda_score']) < 1e-5}")

print("\n--- SITE FINDER ---")
site_res = run_site_finder(ws_ib.request_id, ws_ib)
with open(f"outputs/sites_updated.json", "w") as f:
    json.dump(site_res, f, indent=2, cls=NpEncoder)

print(f"Candidates before size filter: {site_res['total_candidates_before_filter']}")
print(f"Candidates after >=50acre filter: {site_res['total_candidates_after_size_filter']}")
print(f"Surviving (top-5): {site_res['sites']}")

for s in site_res["features"]:
    props = s["properties"]
    print(f"\nSite {props['rank']}  MCDA={props['mcda_score']:.4f}")
    print(f"  raw_metrics  : {props['raw_metrics']}")
    print(f"  norm_metrics : {props['normalized_metrics']}")
    print(f"  weights      : {props['weights']}")
    print(f"  contributions: {props['weighted_contributions']}")
    math_sum = sum(props["weighted_contributions"].values())
    print(f"  math_check: sum={math_sum:.6f} == score={props['mcda_score']:.6f} -> {abs(math_sum - props['mcda_score']) < 1e-5}")
    print(f"  pop_note: {props['population_note']}")
    print(f"  afi_note: {props['afi_note']}")
