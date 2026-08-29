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