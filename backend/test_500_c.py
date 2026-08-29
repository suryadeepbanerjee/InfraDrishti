from fastapi.testclient import TestClient
from src.main import app
client = TestClient(app)
req = {
    "infrastructure_type": "highway",
    "origin": {"name": "Latur", "lon": 76.57, "lat": 18.40},
    "destination": {"name": "Osmanabad", "lon": 76.04, "lat": 18.18},
    "corridor_width_m": 50,
    "n_routes": 3
}
response = client.post("/corridor/plan", json=req)
print(response.json())
