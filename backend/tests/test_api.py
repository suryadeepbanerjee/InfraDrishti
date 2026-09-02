"""
API tests for InfraDrishti.

These validate real behaviour over the validated data cache (Maharashtra,
Latur-Osmanabad AOI). Assertions are strict — success paths must be 200, and
the MCDA/geometry contracts are checked numerically.

Every protected endpoint is tested with a valid RS256 JWT (mocked JWKS).
The server-side Supabase client is patched so persistence is a no-op.
"""

import base64
import math
import os
import time
import uuid
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

# -----------------------------------------------------------------------
# Test RSA key pair (generated once per module)
# -----------------------------------------------------------------------

_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()
_TEST_SUPABASE_URL = "https://test.supabase.co"
_TEST_ISSUER = f"{_TEST_SUPABASE_URL}/auth/v1"
_TEST_USER_ID = str(uuid.uuid4())


def _int_to_b64url(n: int) -> str:
    length = (n.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()


def _make_jwks():
    nums = _PUBLIC_KEY.public_numbers()
    return {"keys": [{
        "kty": "RSA", "kid": "test-k", "alg": "RS256", "use": "sig",
        "n": _int_to_b64url(nums.n), "e": _int_to_b64url(nums.e),
    }]}


def _make_token(user_id=_TEST_USER_ID):
    payload = {
        "sub": user_id,
        "iss": _TEST_ISSUER,
        "aud": "authenticated",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
    }
    return pyjwt.encode(payload, _PRIVATE_KEY, algorithm="RS256", headers={"kid": "test-k"})


@pytest.fixture()
def client(monkeypatch):
    """Provide a TestClient with a valid auth header and mocked Supabase persistence."""
    monkeypatch.setenv("SUPABASE_URL", _TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-secret-not-real")

    with patch("src.core.auth._get_jwks", return_value=_make_jwks()), \
         patch("src.core.supabase_client.create_analysis_run", return_value="mock-analysis-id"), \
         patch("src.core.supabase_client.complete_analysis_run", return_value=True), \
         patch("src.core.supabase_client.fail_analysis_run", return_value=True), \
         patch("src.core.supabase_client.save_corridor_result", return_value=True), \
         patch("src.core.supabase_client.save_site_result", return_value=True):
        from src.core.auth import _get_jwks
        _get_jwks.cache_clear()
        from src.main import app
        with TestClient(app) as c:
            yield c


AUTH_HEADER = {"Authorization": f"Bearer {_make_token()}"}

LATUR = {"name": "Latur", "lon": 76.5726, "lat": 18.4088}
OSMANABAD = {"name": "Osmanabad", "lon": 76.0395, "lat": 18.1814}


# -----------------------------------------------------------------------
# Health (public)
# -----------------------------------------------------------------------

def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


# -----------------------------------------------------------------------
# Corridor
# -----------------------------------------------------------------------

def test_corridor_plan_real(client):
    req = {
        "infrastructure_type": "highway",
        "origin": LATUR,
        "destination": OSMANABAD,
        "corridor_width_m": 500,
        "n_routes": 3,
    }
    response = client.post("/api/v1/corridor/plan", json=req, headers=AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "COMPLETED"
    assert data["routes"] == 3
    assert data["geojson"]["type"] == "FeatureCollection"

    features = data["geojson"]["features"]
    assert len(features) == 3

    for feat in features:
        geom = feat["geometry"]
        assert geom["type"] == "LineString"
        for lon, lat in geom["coordinates"]:
            assert -180 <= lon <= 180
            assert -90 <= lat <= 90
        props = feat["properties"]
        assert "mcda_score" in props
        assert "weights" in props
        assert "weighted_contributions" in props
        assert props["mcda_math_check"] is True
        assert abs(sum(props["weights"].values()) - 1.0) < 1e-6
        assert abs(sum(props["weighted_contributions"].values()) - props["mcda_score"]) < 1e-9
        assert props["metrics"]["route_length_km"] > 0
        assert props["metrics"]["route_length_km"] < 500
        assert "origin_error_m" in props
        assert "destination_error_m" in props
        assert isinstance(props["metrics"]["river_crossings"], (int, float))


def test_corridor_n_routes_honoured(client):
    for n in (1, 2, 3, 5):
        req = {
            "infrastructure_type": "highway",
            "origin": LATUR,
            "destination": OSMANABAD,
            "n_routes": n,
        }
        response = client.post("/api/v1/corridor/plan", json=req, headers=AUTH_HEADER)
        assert response.status_code == 200
        assert response.json()["routes"] == n


def test_corridor_weights_change_score(client):
    base = {
        "infrastructure_type": "highway",
        "origin": LATUR,
        "destination": OSMANABAD,
        "n_routes": 1,
    }
    r1 = client.post("/api/v1/corridor/plan", json=base, headers=AUTH_HEADER).json()
    r2 = client.post(
        "/api/v1/corridor/plan",
        json={**base, "mcda_weights": {"route_length_km": 1.0}},
        headers=AUTH_HEADER,
    ).json()

    f1 = r1["geojson"]["features"][0]["properties"]
    f2 = r2["geojson"]["features"][0]["properties"]
    assert f2["weights"]["route_length_km"] > f1["weights"]["route_length_km"]
    assert f1["mcda_score"] != f2["mcda_score"]


def test_corridor_invalid_weights_rejected(client):
    req = {
        "infrastructure_type": "highway",
        "origin": LATUR,
        "destination": OSMANABAD,
        "mcda_weights": {"unknown_metric_xyz": 0.5},
    }
    response = client.post("/api/v1/corridor/plan", json=req, headers=AUTH_HEADER)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_corridor_outside_coverage_blocked(client):
    req = {
        "infrastructure_type": "highway",
        "origin": {"name": "Indore", "lon": 75.8577, "lat": 22.7196},
        "destination": {"name": "Bhopal", "lon": 77.4126, "lat": 23.2599},
        "n_routes": 3,
    }
    response = client.post("/api/v1/corridor/plan", json=req, headers=AUTH_HEADER)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DATA_COVERAGE_BLOCKER"


# -----------------------------------------------------------------------
# Site
# -----------------------------------------------------------------------

def test_site_find_real(client):
    req = {
        "facility_type": "Logistics Hub",
        "location": {"lat": 18.4088, "lon": 76.5726},
        "required_area_acres": 50,
    }
    response = client.post("/api/v1/site/find", json=req, headers=AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "COMPLETED"
    assert data["sites"] >= 1
    assert data["min_pixels"] == 81

    for feat in data["geojson"]["features"]:
        assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")
        props = feat["properties"]
        assert props["mcda_math_check"] is True
        assert abs(sum(props["weights"].values()) - 1.0) < 1e-6
        assert abs(sum(props["weighted_contributions"].values()) - props["mcda_score"]) < 1e-9
        assert props["metrics"]["site_area_ha"] >= 20.23


def test_site_area_threshold_is_dynamic(client):
    req50 = {
        "facility_type": "Logistics Hub",
        "location": {"lat": 18.4088, "lon": 76.5726},
        "required_area_acres": 50,
    }
    req100 = {**req50, "required_area_acres": 100}
    r50 = client.post("/api/v1/site/find", json=req50, headers=AUTH_HEADER).json()
    r100 = client.post("/api/v1/site/find", json=req100, headers=AUTH_HEADER).json()
    assert r100["min_pixels"] > r50["min_pixels"]
    assert r100["min_pixels"] == 162


def test_site_outside_coverage_blocked(client):
    req = {
        "facility_type": "Logistics Hub",
        "location": {"lat": 22.7196, "lon": 75.8577},
        "required_area_acres": 50,
    }
    response = client.post("/api/v1/site/find", json=req, headers=AUTH_HEADER)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DATA_COVERAGE_BLOCKER"


# -----------------------------------------------------------------------
# Status
# -----------------------------------------------------------------------

def test_status_endpoint(client):
    response = client.get("/api/v1/status/unknown-nonexistent", headers=AUTH_HEADER)
    assert response.status_code == 404


# -----------------------------------------------------------------------
# In-memory history fallback
# -----------------------------------------------------------------------

def test_history_includes_in_memory_records(client):
    """History endpoint merges Supabase and in-memory records."""
    from src.api.routes import _IN_MEMORY_HISTORY
    _IN_MEMORY_HISTORY.clear()

    # Mock create_analysis_run to return None (simulating unconfigured Supabase)
    with patch("src.core.supabase_client.create_analysis_run", return_value=None):
        req = {
            "infrastructure_type": "highway",
            "origin": LATUR,
            "destination": OSMANABAD,
            "n_routes": 1,
        }
        resp = client.post("/api/v1/corridor/plan", json=req, headers=AUTH_HEADER)
        assert resp.status_code == 200

    # The in-memory fallback should have recorded the analysis
    assert len(_IN_MEMORY_HISTORY) >= 1
    assert _IN_MEMORY_HISTORY[-1]["analysis_type"] == "corridor"
    assert _IN_MEMORY_HISTORY[-1]["status"] == "COMPLETED"

    # Fetch history — should include the in-memory record
    resp = client.get("/api/v1/user/history", headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] >= 1
    types = [h["analysis_type"] for h in data["history"]]
    assert "corridor" in types
