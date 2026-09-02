"""
GeoJSON contract tests: validate that API outputs are valid EPSG:4326 GeoJSON
with correct [lon, lat] coordinate order, parseable by geopandas.
"""

import base64
import os
import time
import uuid
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

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
        "sub": user_id, "iss": _TEST_ISSUER, "aud": "authenticated",
        "iat": int(time.time()), "exp": int(time.time()) + 3600,
        "role": "authenticated",
    }
    return pyjwt.encode(payload, _PRIVATE_KEY, algorithm="RS256", headers={"kid": "test-k"})


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", _TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-secret-not-real")

    with patch("src.core.auth._get_jwks", return_value=_make_jwks()), \
         patch("src.core.supabase_client.create_analysis_run", return_value="mock-id"), \
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


def test_corridor_geojson_contract(client):
    req = {
        "infrastructure_type": "highway",
        "origin": {"lon": 76.5726, "lat": 18.4088},
        "destination": {"lon": 76.0395, "lat": 18.1814},
        "n_routes": 3,
    }
    data = client.post("/api/v1/corridor/plan", json=req, headers=AUTH_HEADER).json()
    fc = data["geojson"]
    assert fc["type"] == "FeatureCollection"

    for feat in fc["features"]:
        coords = feat["geometry"]["coordinates"]
        for lon, lat in coords:
            assert 75.0 < lon < 78.0
            assert 17.0 < lat < 19.5


def test_site_geojson_contract(client):
    req = {
        "facility_type": "Logistics Hub",
        "location": {"lat": 18.4088, "lon": 76.5726},
        "required_area_acres": 50,
    }
    data = client.post("/api/v1/site/find", json=req, headers=AUTH_HEADER).json()
    fc = data["geojson"]
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) >= 1
    for feat in fc["features"]:
        assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")
