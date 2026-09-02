import json
from pathlib import Path
from src.corridor.planner import run_corridor_planner
from src.site.finder import run_site_finder
from src.models.schemas import CorridorRequest, SiteRequest, PointConfig, ProximityConstraints

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"

# Corridor Request (Latur to Osmanabad highway)
corridor_req = CorridorRequest(
    infrastructure_type="highway",
    origin=PointConfig(name="Latur", lon=76.57, lat=18.40),
    destination=PointConfig(name="Osmanabad", lon=76.04, lat=18.18),
    corridor_width_m=500,
    n_routes=3
)

print("Running Corridor Planner...")
c_res = run_corridor_planner(corridor_req)
print(f"Corridor Planner complete. Generated {c_res['routes']} routes.")

# Site Request (Highway facility)
site_req = SiteRequest(
    facility_type="highway",
    required_area_m2=202343, # 50 acres
    proximity_constraints=ProximityConstraints(
        max_dist_to_highway_m=5000,
        max_slope_deg=10
    )
)

print("Running Site Finder...")
s_res = run_site_finder(site_req)
print(f"Site Finder complete. Generated {s_res['sites']} sites.")

# Validation
c_file = OUTPUT_DIR / "routes.geojson"
s_file = OUTPUT_DIR / "sites.geojson"
c_exp = OUTPUT_DIR / "route_explanations.json"
s_exp = OUTPUT_DIR / "site_explanations.json"

print(f"\n--- VALIDATION ---")
print(f"Routes file exists: {c_file.exists()}")
print(f"Sites file exists: {s_file.exists()}")
print(f"Route Explanations file exists: {c_exp.exists()}")
print(f"Site Explanations file exists: {s_exp.exists()}")

if c_file.exists():
    with open(c_file) as f:
        c_data = json.load(f)
        pa_overlap_max = max([f['properties']['metrics']['protected_area_overlap'] for f in c_data['features']])
        print(f"Max PA overlap across routes: {pa_overlap_max} (Must be 0)")

if s_file.exists() and s_res['sites'] > 0:
    with open(s_file) as f:
        s_data = json.load(f)
        pa_overlap_max = max([f['properties']['metrics']['protected_area_overlap'] for f in s_data['features']])
        print(f"Max PA overlap across sites: {pa_overlap_max} (Must be 0)")
