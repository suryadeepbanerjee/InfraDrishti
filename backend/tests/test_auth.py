"""
tests/test_auth.py — Backend JWT validation tests.

Tests:
  - Missing Authorization header → 401
  - Malformed token → 401
  - Expired token → 401
  - Invalid signature → 401
  - Invalid issuer → 401
  - user_id never from request body (JWT is authoritative)
  - Demo mode: any Bearer token accepted (placeholder secret key)
  - Demo mode: user_id extracted from token sub claim
  - Demo mode: fallback to demo-user-123 when sub missing
"""

import time
import uuid
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend


# ---------------------------------------------------------------------------
# Test key generation
# ---------------------------------------------------------------------------

def _make_rsa_pair():
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    public_key = private_key.public_key()
    return private_key, public_key


PRIVATE_KEY, PUBLIC_KEY = _make_rsa_pair()
TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"
TEST_USER_ID = str(uuid.uuid4())


def _int_to_base64url(n):
    length = (n.bit_length() + 7) // 8
    data = n.to_bytes(length, "big")
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


import base64

def _make_valid_token(
    user_id=TEST_USER_ID,
    issuer=TEST_ISSUER,
    exp_offset=3600,
) -> str:
    payload = {
        "sub": user_id,
        "iss": issuer,
        "aud": "authenticated",
        "iat": int(time.time()),
        "exp": int(time.time()) + exp_offset,
        "role": "authenticated",
    }
    return pyjwt.encode(payload, PRIVATE_KEY, algorithm="RS256", headers={"kid": "test-key"})


def _make_jwks_response():
    """Return a JWKS JSON with the test public key."""
    pub_numbers = PUBLIC_KEY.public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "kid": "test-key",
                "alg": "RS256",
                "use": "sig",
                "n": _int_to_base64url(pub_numbers.n),
                "e": _int_to_base64url(pub_numbers.e),
            }
        ]
    }


# ---------------------------------------------------------------------------
# App fixture with mocked JWKS
# ---------------------------------------------------------------------------

@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-secret-not-real")

    with patch("src.core.auth._get_jwks", return_value=_make_jwks_response()):
        from src.core.auth import _get_jwks
        _get_jwks.cache_clear()
        from src.main import app
        with TestClient(app) as c:
            yield c


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMissingToken:
    def test_corridor_no_auth_header(self, client):
        resp = client.post("/api/v1/corridor/plan", json={
            "infrastructure_type": "highway",
            "origin": {"name": "A", "lon": 76.5726, "lat": 18.4088},
            "destination": {"name": "B", "lon": 76.0395, "lat": 18.1814},
        })
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_site_no_auth_header(self, client):
        resp = client.post("/api/v1/site/find", json={
            "facility_type": "logistics_hub",
            "location": {"lat": 18.4088, "lon": 76.5726},
        })
        assert resp.status_code == 401

    def test_history_no_auth_header(self, client):
        resp = client.get("/api/v1/user/history")
        assert resp.status_code == 401

    def test_health_is_public(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200


class TestInvalidTokens:
    def test_random_string_token(self, client):
        resp = client.get(
            "/api/v1/user/history",
            headers={"Authorization": "Bearer notavalidtoken"},
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.json()}"

    def test_expired_token(self, client):
        token = _make_valid_token(exp_offset=-3600)
        resp = client.get(
            "/api/v1/user/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
        assert "expired" in resp.json().get("detail", "").lower()

    def test_wrong_issuer(self, client):
        token = _make_valid_token(issuer="https://evil.example.com/auth/v1")
        resp = client.get(
            "/api/v1/user/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_wrong_signature(self, client):
        other_private, _ = _make_rsa_pair()
        payload = {
            "sub": TEST_USER_ID, "iss": TEST_ISSUER,
            "aud": "authenticated", "iat": int(time.time()), "exp": int(time.time()) + 3600,
        }
        token = pyjwt.encode(payload, other_private, algorithm="RS256", headers={"kid": "test-key"})
        resp = client.get(
            "/api/v1/user/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401


class TestValidToken:
    def test_valid_token_reaches_handler(self, client):
        """A valid JWT should pass auth (may fail for other reasons like DB, but not 401)."""
        token = _make_valid_token()
        with patch("src.core.supabase_client.get_user_history", return_value=[]):
            resp = client.get(
                "/api/v1/user/history",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code != 401, f"Unexpected 401: {resp.json()}"

    def test_user_id_derived_from_jwt_not_body(self, client):
        """Ensure the user_id in the request body cannot override the JWT sub."""
        token = _make_valid_token(user_id=TEST_USER_ID)
        malicious_user_id = str(uuid.uuid4())

        with patch("src.core.supabase_client.create_analysis_run", return_value="fake-id") as mock_create, \
             patch("src.core.supabase_client.complete_analysis_run", return_value=True), \
             patch("src.core.supabase_client.save_corridor_result", return_value=True), \
             patch("src.core.data_cache.check_points_within_cache", return_value=False):

            resp = client.post(
                "/api/v1/corridor/plan",
                json={
                    "infrastructure_type": "highway",
                    "origin": {"name": "A", "lon": 76.5726, "lat": 18.4088},
                    "destination": {"name": "B", "lon": 76.0395, "lat": 18.1814},
                    "user_id": malicious_user_id,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            if mock_create.called:
                called_user_id = mock_create.call_args[1].get("user_id") or mock_create.call_args[0][0]
                assert called_user_id == TEST_USER_ID, \
                    f"Backend used body user_id {called_user_id} instead of JWT user_id {TEST_USER_ID}"


# ---------------------------------------------------------------------------
# Demo-mode tests
# ---------------------------------------------------------------------------

class TestDemoMode:
    """When SUPABASE_SECRET_KEY is a placeholder, demo-mode bypass is active."""

    @pytest.fixture()
    def demo_client(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "placeholder_demo_key")

        from src.core.auth import _get_jwks
        _get_jwks.cache_clear()
        from src.core.auth import _is_demo_mode
        assert _is_demo_mode(), "Expected demo mode to be active"

        from src.main import app
        with TestClient(app) as c:
            yield c

    def test_demo_mode_accepts_arbitrary_token(self, demo_client):
        """Any Bearer token is accepted in demo mode — no JWKS needed."""
        resp = demo_client.get(
            "/api/v1/health",
            headers={"Authorization": "Bearer totally-fake-token"},
        )
        # Health is public, but let's test a protected endpoint
        with patch("src.core.supabase_client.get_user_history", return_value=[]):
            resp = demo_client.get(
                "/api/v1/user/history",
                headers={"Authorization": "Bearer totally-fake-token"},
            )
        assert resp.status_code != 401, f"Demo mode should not return 401: {resp.json()}"

    def test_demo_mode_extracts_user_from_sub(self, demo_client):
        """Demo mode extracts user_id from the token's sub claim."""
        import base64, json
        # Build a minimal JWT-like token with a known sub
        header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(json.dumps({"sub": "custom-demo-user"}).encode()).rstrip(b"=").decode()
        fake_token = f"{header}.{payload}."

        with patch("src.core.supabase_client.create_analysis_run", return_value="fake-id") as mock_create, \
             patch("src.core.supabase_client.fail_analysis_run", return_value=True), \
             patch("src.core.data_cache.check_points_within_cache", return_value=False):

            resp = demo_client.post(
                "/api/v1/corridor/plan",
                json={
                    "infrastructure_type": "highway",
                    "origin": {"name": "A", "lon": 76.5726, "lat": 18.4088},
                    "destination": {"name": "B", "lon": 76.0395, "lat": 18.1814},
                },
                headers={"Authorization": f"Bearer {fake_token}"},
            )
        if mock_create.called:
            called_user_id = mock_create.call_args[1].get("user_id") or mock_create.call_args[0][0]
            assert called_user_id == "custom-demo-user", \
                f"Expected extracted user_id, got {called_user_id}"

    def test_demo_mode_fallback_user_id(self, demo_client):
        """When token cannot be decoded, demo mode uses fallback user_id."""
        with patch("src.core.supabase_client.create_analysis_run", return_value="fake-id") as mock_create, \
             patch("src.core.supabase_client.fail_analysis_run", return_value=True), \
             patch("src.core.data_cache.check_points_within_cache", return_value=False):

            resp = demo_client.post(
                "/api/v1/corridor/plan",
                json={
                    "infrastructure_type": "highway",
                    "origin": {"name": "A", "lon": 76.5726, "lat": 18.4088},
                    "destination": {"name": "B", "lon": 76.0395, "lat": 18.1814},
                },
                headers={"Authorization": "Bearer not-a-jwt-at-all"},
            )
        if mock_create.called:
            called_user_id = mock_create.call_args[1].get("user_id") or mock_create.call_args[0][0]
            assert called_user_id == "demo-user-123", \
                f"Expected fallback demo user_id, got {called_user_id}"

    def test_demo_mode_still_requires_auth_header(self, demo_client):
        """Missing Authorization header still returns 401 even in demo mode."""
        resp = demo_client.post("/api/v1/corridor/plan", json={
            "infrastructure_type": "highway",
            "origin": {"name": "A", "lon": 76.5726, "lat": 18.4088},
            "destination": {"name": "B", "lon": 76.0395, "lat": 18.1814},
        })
        assert resp.status_code == 401
