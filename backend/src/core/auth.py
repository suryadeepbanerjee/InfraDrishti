"""
auth.py — JWT validation via Supabase JWKS (no service-role key needed).

Validates browser JWTs locally using the project's public JWKS endpoint.
The JWKS endpoint is public — no SUPABASE_SECRET_KEY required for auth.

DEMO MODE: When SUPABASE_SECRET_KEY is not a real service-role key (i.e. is
a placeholder), the backend operates in "demo mode". In demo mode, any request
that carries a Bearer token is accepted with a synthetic user_id derived from
the token's ``sub`` claim (or a fallback demo identity). Full JWKS validation
is skipped so that the analysis pipeline works without network access to
Supabase's JWKS endpoint.
"""

from __future__ import annotations

import base64
import logging
import os
import time
from functools import lru_cache
from typing import Any, Dict, Optional

import jwt as pyjwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)

_DEMO_USER_ID = "demo-user-123"
_PLACEHOLDER_KEYS = {"", "placeholder_demo_key", "placeholder", "demo"}


def _is_demo_mode() -> bool:
    """Return True when Supabase is not fully configured (placeholder secret key)."""
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    return key in _PLACEHOLDER_KEYS


def _int_to_bytes(n: int) -> bytes:
    length = (n.bit_length() + 7) // 8
    return n.to_bytes(length, "big")


def _base64url_decode(value: str) -> bytes:
    padding = 4 - len(value) % 4
    if padding != 4:
        value += "=" * padding
    return base64.urlsafe_b64decode(value)


@lru_cache(maxsize=1)
def _get_jwks() -> Dict[str, Any]:
    """Fetch the Supabase project's JWKS endpoint and cache the result."""
    import httpx

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL must be set to validate JWTs")

    jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(jwks_url, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _get_signing_key(jwks: Dict[str, Any], kid: str):
    """Find the matching key in JWKS and return an RSAPublicKey."""
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            n = int.from_bytes(_base64url_decode(key_data["n"]), "big")
            e = int.from_bytes(_base64url_decode(key_data["e"]), "big")
            public_numbers = RSAPublicNumbers(e, n)
            return public_numbers.public_key(backend=default_backend())
    raise HTTPException(status_code=401, detail="No matching signing key found")


def _extract_user_from_token(token: str) -> Optional[str]:
    """Best-effort extraction of ``sub`` from an unverified JWT payload.

    Used only in demo mode when full JWKS validation is not available.
    Returns None if the token cannot be decoded at all.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Re-pad base64
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        import json
        payload = json.loads(payload_bytes)
        return payload.get("sub")
    except Exception:
        return None


def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """Validate JWT and return user_id.

    In **demo mode** (placeholder SUPABASE_SECRET_KEY), a Bearer token is
    accepted with a synthetic user_id — full JWKS validation is skipped so
    the analysis pipeline works without Supabase network access.

    In **production mode**, the JWT is validated against the project's public
    JWKS endpoint exactly as before.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = credentials.credentials

    # ── Demo-mode fast-path ────────────────────────────────────────────
    if _is_demo_mode():
        user_id = _extract_user_from_token(token) or _DEMO_USER_ID
        logger.debug("Demo-mode auth: accepting token for user %s", user_id)
        return user_id

    # ── Production: full JWKS validation ───────────────────────────────
    try:
        # Decode header to get kid
        unverified_header = pyjwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Token missing kid header")

        # Fetch JWKS (cached after first call)
        jwks = _get_jwks()

        # Get the matching public key
        signing_key = _get_signing_key(jwks, kid)

        # Build expected issuer from SUPABASE_URL
        supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        expected_issuer = f"{supabase_url}/auth/v1"

        # Validate the JWT locally
        payload = pyjwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience="authenticated",
            issuer=expected_issuer,
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing sub claim")

        return user_id

    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except pyjwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Invalid token issuer")
    except pyjwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid token audience")
    except pyjwt.InvalidSignatureError:
        raise HTTPException(status_code=401, detail="Invalid token signature")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("JWT validation failed: %s", e)
        raise HTTPException(status_code=401, detail=f"Token validation failed: {e}")
