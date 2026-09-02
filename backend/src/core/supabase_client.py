"""
supabase_client.py — Server-side Supabase client for InfraDrishti.

Uses SUPABASE_SECRET_KEY (service-role key) which:
  - bypasses RLS for trusted server operations
  - MUST NEVER be sent to the frontend or logged

All functions that write to the database use the authenticated user_id
derived from the validated JWT — never from client-supplied fields.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def _get_client() -> Client:
    """Return a singleton Supabase service-role client."""
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SECRET_KEY", "")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY must be set in the backend environment. "
                "Without these, analysis results cannot be persisted to Supabase. "
                "Set SUPABASE_SECRET_KEY in backend/.env (service-role key from Supabase Dashboard → Settings → API)."
            )
        _client = create_client(url, key)
    return _client


def is_configured() -> bool:
    """Check if Supabase credentials are configured. Returns False if missing."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    return bool(url and key)


# ---------------------------------------------------------------------------
# Analysis runs
# ---------------------------------------------------------------------------

def create_analysis_run(
    user_id: str,
    request_id: str,
    analysis_type: str,
    title: str,
    request_params: Dict[str, Any],
    origin_name: Optional[str] = None,
    origin_lat: Optional[float] = None,
    origin_lon: Optional[float] = None,
    destination_name: Optional[str] = None,
    destination_lat: Optional[float] = None,
    destination_lon: Optional[float] = None,
    infrastructure_type: Optional[str] = None,
    facility_type: Optional[str] = None,
) -> Optional[str]:
    """
    Insert an analysis_runs row with status=PROCESSING.
    Returns the new row's UUID, or None on failure.
    user_id comes from validated JWT — never from request body.
    """
    if not is_configured():
        logger.warning("Supabase not configured — analysis_run not persisted (request %s)", request_id)
        return None
    try:
        client = _get_client()
        row = {
            "user_id": user_id,
            "request_id": request_id,
            "analysis_type": analysis_type,
            "status": "PROCESSING",
            "title": title,
            "request_params": request_params,
            "origin_name": origin_name,
            "origin_lat": origin_lat,
            "origin_lon": origin_lon,
            "destination_name": destination_name,
            "destination_lat": destination_lat,
            "destination_lon": destination_lon,
            "infrastructure_type": infrastructure_type,
            "facility_type": facility_type,
        }
        resp = client.table("analysis_runs").insert(row).execute()
        if resp.data:
            return resp.data[0]["id"]
        logger.error("create_analysis_run: no data in response")
        return None
    except Exception as exc:
        logger.error("create_analysis_run failed: %s", exc)
        return None


def complete_analysis_run(
    analysis_id: str,
    result_summary: Dict[str, Any],
) -> bool:
    """Mark an analysis_runs row as COMPLETED with a result summary."""
    if not is_configured():
        return False
    try:
        client = _get_client()
        client.table("analysis_runs").update({
            "status": "COMPLETED",
            "result_summary": result_summary,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", analysis_id).execute()
        return True
    except Exception as exc:
        logger.error("complete_analysis_run failed: %s", exc)
        return False


def fail_analysis_run(
    analysis_id: str,
    error_code: str,
    error_message: str,
) -> bool:
    """Mark an analysis_runs row as FAILED with safe error info (no stack traces)."""
    if not is_configured():
        return False
    try:
        client = _get_client()
        client.table("analysis_runs").update({
            "status": "FAILED",
            "error_code": error_code,
            "error_message": error_message[:500],  # cap length, never a traceback
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", analysis_id).execute()
        return True
    except Exception as exc:
        logger.error("fail_analysis_run failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Corridor results
# ---------------------------------------------------------------------------

def save_corridor_result(
    analysis_id: str,
    user_id: str,
    geojson: Dict,
    routes: List[Dict],
    result: Dict[str, Any],
) -> bool:
    """
    Save corridor GeoJSON + metrics/MCDA to corridor_results.
    Stores only the final result — no intermediate rasters or cost surfaces.
    """
    if not is_configured():
        logger.warning("Supabase not configured — corridor result not persisted (analysis %s)", analysis_id)
        return False
    try:
        client = _get_client()
        # Extract a lean version: strip heavy '_geom' keys if any slipped through
        lean_features = []
        for f in geojson.get("features", []):
            lean = {k: v for k, v in f.items() if k != "_geom"}
            lean_features.append(lean)

        # Aggregate MCDA across routes for the mcda column
        mcda_summary = [
            {
                "id": r.get("properties", {}).get("id"),
                "rank": r.get("properties", {}).get("rank"),
                "mcda_score": r.get("properties", {}).get("mcda_score"),
                "mcda_score_relative": r.get("properties", {}).get("mcda_score_relative"),
                "weights": r.get("properties", {}).get("weights"),
                "weighted_contributions": r.get("properties", {}).get("weighted_contributions"),
                "math_check": r.get("properties", {}).get("mcda_math_check"),
            }
            for r in lean_features
        ]

        metrics_summary = [
            {
                "id": r.get("properties", {}).get("id"),
                "metrics": r.get("properties", {}).get("metrics"),
            }
            for r in lean_features
        ]

        row = {
            "analysis_id": analysis_id,
            "user_id": user_id,
            "geojson": {"type": "FeatureCollection", "features": lean_features},
            "routes": routes,
            "metrics": metrics_summary,
            "mcda": mcda_summary,
            "explanation": [
                {
                    "id": r.get("properties", {}).get("id"),
                    "explanation": r.get("properties", {}).get("explanation"),
                }
                for r in lean_features
            ],
            "provenance": result.get("provenance") or (
                lean_features[0].get("properties", {}).get("provenance") if lean_features else None
            ),
        }
        client.table("corridor_results").insert(row).execute()
        return True
    except Exception as exc:
        logger.error("save_corridor_result failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Site results
# ---------------------------------------------------------------------------

def save_site_result(
    analysis_id: str,
    user_id: str,
    geojson: Dict,
    sites: List[Dict],
    result: Dict[str, Any],
) -> bool:
    """Save site GeoJSON + metrics to site_results."""
    if not is_configured():
        logger.warning("Supabase not configured — site result not persisted (analysis %s)", analysis_id)
        return False
    try:
        client = _get_client()
        lean_features = [
            {k: v for k, v in f.items() if k != "_geom"}
            for f in geojson.get("features", [])
        ]
        row = {
            "analysis_id": analysis_id,
            "user_id": user_id,
            "geojson": {"type": "FeatureCollection", "features": lean_features},
            "sites": sites,
            "metrics": [
                {"id": f.get("properties", {}).get("id"), "metrics": f.get("properties", {}).get("metrics")}
                for f in lean_features
            ],
            "mcda": [
                {
                    "id": f.get("properties", {}).get("id"),
                    "mcda_score": f.get("properties", {}).get("mcda_score"),
                    "weights": f.get("properties", {}).get("weights"),
                }
                for f in lean_features
            ],
            "explanation": None,
            "provenance": result.get("provenance"),
        }
        client.table("site_results").insert(row).execute()
        return True
    except Exception as exc:
        logger.error("save_site_result failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def get_user_history(user_id: str, limit: int = 50) -> List[Dict]:
    """
    Fetch analysis_runs for a specific user, newest first.
    user_id comes from the validated JWT — enforces ownership.
    """
    if not is_configured():
        logger.warning("Supabase not configured — history not available for user %s", user_id)
        return []
    try:
        client = _get_client()
        resp = (
            client.table("analysis_runs")
            .select(
                "id, request_id, analysis_type, status, title, "
                "origin_name, origin_lat, origin_lon, "
                "destination_name, destination_lat, destination_lon, "
                "infrastructure_type, facility_type, "
                "result_summary, error_code, error_message, "
                "created_at, completed_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.error("get_user_history failed: %s", exc)
        return []
