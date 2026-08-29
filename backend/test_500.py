from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

req = {
    "infrastructure_type": "highway",
    "origin": {"name": "Latur", "lon": 76.57, "lat": 18.40},
    "destination": {"name": "Osmanabad", "lon": 76.04, "lat": 18.18},
    "corridor_width_m": 50,
    "n_routes": 2
}
response = client.post("/corridor/plan", json=req)
print("Corridor Error:", response.json())

req2 = {
    "facility_type": "factory",
    "required_area_m2": 202343,
    "proximity_constraints": {
        "max_dist_to_highway_m": 5000,
        "max_slope_deg": 10
    }
}
response2 = client.post("/site/find", json=req2)
print("Site Error:", response2.json())
