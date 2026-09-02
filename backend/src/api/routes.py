"""
routes.py - InfraDrishti API Route Handlers

Each corridor/site request:
  1. Validates JWT → derives authenticated user_id (never trusted from body)
  2. Validates input (Pydantic)
  3. Creates analysis_runs row (status=PROCESSING)
  4. Checks data-cache coverage
  5. Runs planner/finder on real geospatial data
  6. Saves result to corridor_results / site_results
  7. Marks analysis_runs COMPLETED (or FAILED with safe error)
  8. Returns real GeoJSON + MCDA + metrics + provenance

Public: GET /health
Protected: POST /corridor/plan, POST /site/find, GET /user/history
"""

import logging
import re
import traceback
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from src.models.schemas import CorridorRequest, SiteRequest
from src.corridor.planner import run_corridor_planner
from src.site.finder import run_site_finder
from src.core.workspace import WorkspaceManager
from src.core.data_cache import (
    check_points_within_cache,
    populate_workspace_from_cache,
    get_cache_bounds_wgs84,
)
from src.core.auth import get_current_user_id
from src.core import supabase_client as supa

logger = logging.getLogger(__name__)
router = APIRouter()

_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "configs" / "infrastructure_profiles.yaml"

_REQUEST_STATUS: dict = {}
_IN_MEMORY_HISTORY: list = []


def _error(code: str, message: str, request_id: str = None, http_status: int = None) -> JSONResponse:
    if http_status is None:
        http_status = 400 if code in {
            "INVALID_REQUEST", "REQUEST_TOO_LARGE", "NO_VALID_ROUTE",
            "NO_SUITABLE_SITE", "VALIDATION_FAILED"
        } else 500
    return JSONResponse(
        status_code=http_status,
        content={"error": {"code": code, "message": message, "request_id": request_id}},
    )


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _corridor_profile_name(raw: str) -> str:
    slug = _slug(raw)
    mapping = {
        "highway": "highway", "expressway": "highway", "road": "highway",
        "railway": "railway", "rail": "railway", "heavy_rail": "railway",
        "high_speed_rail": "railway",
        "power_transmission": "power_transmission", "power": "power_transmission",
    }
    return mapping.get(slug, "highway")


def _facility_profile_name(raw: str) -> str:
    slug = _slug(raw)
    mapping = {
        "logistics_hub": "logistics_hub", "logistics": "logistics_hub",
        "warehouse": "logistics_hub", "cold_storage_warehouse": "logistics_hub",
        "manufacturing_plant": "manufacturing_plant", "manufacturing": "manufacturing_plant",
        "factory": "manufacturing_plant", "industrial": "manufacturing_plant",
        "data_center": "data_center", "data_center_campus": "data_center", "datacenter": "data_center",
        "solar_park": "solar_park", "renewable_solar_park": "solar_park", "solar": "solar_park",
    }
    return mapping.get(slug, "logistics_hub")


# ---------------------------------------------------------------------------
# CORRIDOR PLANNER — protected
# ---------------------------------------------------------------------------

@router.post("/corridor/plan")
def plan_corridor(
    req: CorridorRequest,
    user_id: str = Depends(get_current_user_id),   # JWT-derived, never from body
):
    ws = None
    analysis_id: str | None = None
    try:
        ws = WorkspaceManager()
        req_id = ws.request_id
        _REQUEST_STATUS[req_id] = {"status": "PROCESSING", "message": "Queued"}

        profile_name = _corridor_profile_name(req.infrastructure_type)
        title = f"{req.origin.name or 'Origin'} → {req.destination.name or 'Destination'}"

        logger.info(
            "Corridor request %s [user=%s]: (%.4f,%.4f) -> (%.4f,%.4f) [%s] n_routes=%d",
            req_id, user_id, req.origin.lon, req.origin.lat,
            req.destination.lon, req.destination.lat,
            req.infrastructure_type, req.n_routes,
        )

        # Create analysis_runs row — user_id from JWT only
        analysis_id = supa.create_analysis_run(
            user_id=user_id,
            request_id=req_id,
            analysis_type="corridor",
            title=title,
            request_params={
                "infrastructure_type": req.infrastructure_type,
                "corridor_width_m": req.corridor_width_m,
                "n_routes": req.n_routes,
                "mcda_weights": req.mcda_weights,
            },
            origin_name=req.origin.name,
            origin_lat=req.origin.lat,
            origin_lon=req.origin.lon,
            destination_name=req.destination.name,
            destination_lat=req.destination.lat,
            destination_lon=req.destination.lon,
            infrastructure_type=profile_name,
        )

        # Data coverage check
        points = [(req.origin.lon, req.origin.lat), (req.destination.lon, req.destination.lat)]
        if not check_points_within_cache(points):
            cache_b = get_cache_bounds_wgs84()
            bounds_str = (
                f"lon {cache_b[0]:.3f}-{cache_b[2]:.3f}, lat {cache_b[1]:.3f}-{cache_b[3]:.3f}"
                if cache_b else "no cache available"
            )
            msg = (
                f"One or more corridor endpoints are outside the validated data cache "
                f"({bounds_str}). Dynamic dataset acquisition is required for this AOI."
            )
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "DATA_COVERAGE_BLOCKER", msg)
            if not analysis_id:
                from datetime import datetime, timezone
                _IN_MEMORY_HISTORY.append({
                    "id": f"inmem-{req_id}", "request_id": req_id,
                    "analysis_type": "corridor", "status": "FAILED",
                    "title": title, "origin_name": req.origin.name,
                    "origin_lat": req.origin.lat, "origin_lon": req.origin.lon,
                    "destination_name": req.destination.name,
                    "destination_lat": req.destination.lat, "destination_lon": req.destination.lon,
                    "infrastructure_type": profile_name, "facility_type": None,
                    "result_summary": None, "error_code": "DATA_COVERAGE_BLOCKER",
                    "error_message": msg,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                })
            return _error("DATA_COVERAGE_BLOCKER", msg, req_id, http_status=422)

        if not populate_workspace_from_cache(ws):
            msg = "Failed to load validated data into workspace."
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "PROCESSING_FAILED", msg)
            return _error("PROCESSING_FAILED", msg, req_id)

        try:
            result = run_corridor_planner(
                req_id, ws,
                profile_name=profile_name,
                origin_lonlat=(req.origin.lon, req.origin.lat),
                dest_lonlat=(req.destination.lon, req.destination.lat),
                n_routes=req.n_routes,
                user_mcda_weights=req.mcda_weights,
            )
        except ValueError as e:
            msg = str(e)
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "VALIDATION_FAILED", msg)
            return _error("VALIDATION_FAILED", msg, req_id, http_status=400)

        if not result.get("features"):
            reason = "; ".join(result.get("failed_attempts", [])) or "No viable path found."
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "NO_VALID_ROUTE", reason)
            _REQUEST_STATUS[req_id] = {"status": "FAILED", "message": reason}
            return _error("NO_VALID_ROUTE", reason, req_id)

        geojson_out = {
            "type": "FeatureCollection",
            "features": result["features"],
        }

        # Build result_summary (lightweight — no rasters)
        result_summary = {
            "routes": len(result["features"]),
            "top_score": result["features"][0]["properties"].get("mcda_score_relative")
                         if result["features"] else None,
            "top_length_km": result["features"][0]["properties"].get("metrics", {}).get("route_length_km")
                             if result["features"] else None,
        }

        # Persist to Supabase (non-blocking: failure logged, not raised)
        if analysis_id:
            supa.complete_analysis_run(analysis_id, result_summary)
            supa.save_corridor_result(
                analysis_id=analysis_id,
                user_id=user_id,
                geojson=geojson_out,
                routes=[
                    {
                        "id": f["properties"].get("id"),
                        "rank": f["properties"].get("rank"),
                        "score": f["properties"].get("mcda_score_relative"),
                        "length_km": f["properties"].get("metrics", {}).get("route_length_km"),
                    }
                    for f in result["features"]
                ],
                result={"provenance": result["features"][0]["properties"].get("provenance") if result["features"] else None},
            )

        ws.cleanup()
        _REQUEST_STATUS[req_id] = {"status": "COMPLETED", "message": f"{len(result['features'])} routes"}

        # Record in-memory history when Supabase persistence is unavailable
        if not analysis_id:
            from datetime import datetime, timezone
            _IN_MEMORY_HISTORY.append({
                "id": f"inmem-{req_id}",
                "request_id": req_id,
                "analysis_type": "corridor",
                "status": "COMPLETED",
                "title": title,
                "origin_name": req.origin.name,
                "origin_lat": req.origin.lat,
                "origin_lon": req.origin.lon,
                "destination_name": req.destination.name,
                "destination_lat": req.destination.lat,
                "destination_lon": req.destination.lon,
                "infrastructure_type": profile_name,
                "facility_type": None,
                "result_summary": result_summary,
                "error_code": None,
                "error_message": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })

        return {
            "request_id": req_id,
            "analysis_id": analysis_id,
            "status": "COMPLETED",
            "routes": len(result["features"]),
            "infrastructure_type": profile_name,
            "corridor_width_m": req.corridor_width_m,
            "n_routes": req.n_routes,
            "geojson": geojson_out,
            "diversity_metrics": result.get("diversity", []),
            "failed_attempts": result.get("failed_attempts", []),
        }

    except Exception:
        tb = traceback.format_exc()
        logger.error("Unhandled corridor error:\n%s", tb)
        if analysis_id:
            supa.fail_analysis_run(analysis_id, "PROCESSING_FAILED", "Internal server error.")
        return _error(
            "PROCESSING_FAILED",
            "An internal error occurred during corridor planning.",
            getattr(ws, "request_id", None),
        )


# ---------------------------------------------------------------------------
# SITE FINDER — protected
# ---------------------------------------------------------------------------

@router.post("/site/find")
def find_site(
    req: SiteRequest,
    user_id: str = Depends(get_current_user_id),   # JWT-derived, never from body
):
    ws = None
    analysis_id: str | None = None
    try:
        ws = WorkspaceManager()
        req_id = ws.request_id
        _REQUEST_STATUS[req_id] = {"status": "PROCESSING", "message": "Queued"}

        if req.location is None:
            return _error("INVALID_REQUEST", "A location (lat/lon) is required for site finding.", req_id)

        facility_name = _facility_profile_name(req.facility_type)
        title = f"Site: {facility_name} @ ({req.location.lat:.3f},{req.location.lon:.3f})"

        logger.info("Site request %s [user=%s]: facility=%s", req_id, user_id, facility_name)

        # Create analysis_runs row
        analysis_id = supa.create_analysis_run(
            user_id=user_id,
            request_id=req_id,
            analysis_type="site",
            title=title,
            request_params={
                "facility_type": req.facility_type,
                "required_area_m2": req.required_area_m2,
                "mcda_weights": req.mcda_weights,
            },
            origin_lat=req.location.lat,
            origin_lon=req.location.lon,
            facility_type=facility_name,
        )

        points = [(req.location.lon, req.location.lat)]
        if not check_points_within_cache(points):
            cache_b = get_cache_bounds_wgs84()
            bounds_str = (
                f"lon {cache_b[0]:.3f}-{cache_b[2]:.3f}, lat {cache_b[1]:.3f}-{cache_b[3]:.3f}"
                if cache_b else "no cache available"
            )
            msg = (
                f"The site location is outside the validated data cache ({bounds_str}). "
                f"Dynamic dataset acquisition is required for this AOI."
            )
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "DATA_COVERAGE_BLOCKER", msg)
            if not analysis_id:
                from datetime import datetime, timezone
                _IN_MEMORY_HISTORY.append({
                    "id": f"inmem-{req_id}", "request_id": req_id,
                    "analysis_type": "site", "status": "FAILED",
                    "title": title, "origin_name": None,
                    "origin_lat": req.location.lat, "origin_lon": req.location.lon,
                    "destination_name": None, "destination_lat": None,
                    "destination_lon": None,
                    "infrastructure_type": None, "facility_type": facility_name,
                    "result_summary": None, "error_code": "DATA_COVERAGE_BLOCKER",
                    "error_message": msg,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                })
            return _error("DATA_COVERAGE_BLOCKER", msg, req_id, http_status=422)

        if not populate_workspace_from_cache(ws):
            msg = "Failed to load validated data into workspace."
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "PROCESSING_FAILED", msg)
            return _error("PROCESSING_FAILED", msg, req_id)

        required_area_m2 = req.required_area_m2
        if req.required_area_acres is not None:
            required_area_m2 = float(req.required_area_acres) * 4046.8564224

        try:
            result = run_site_finder(
                req_id, ws,
                profile_name=facility_name,
                required_area_m2=required_area_m2,
                user_mcda_weights=req.mcda_weights,
            )
        except ValueError as e:
            msg = str(e)
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "VALIDATION_FAILED", msg)
            return _error("VALIDATION_FAILED", msg, req_id, http_status=400)

        if not result.get("features"):
            msg = (
                f"No contiguous sites meeting minimum area requirements found. "
                f"Checked {result.get('total_candidates_before_filter', 0)} candidate regions."
            )
            if analysis_id:
                supa.fail_analysis_run(analysis_id, "NO_SUITABLE_SITE", msg)
            _REQUEST_STATUS[req_id] = {"status": "FAILED", "message": "No suitable site"}
            return _error("NO_SUITABLE_SITE", msg, req_id)

        geojson_out = {"type": "FeatureCollection", "features": result["features"]}
        result_summary = {"sites": len(result["features"])}

        if analysis_id:
            supa.complete_analysis_run(analysis_id, result_summary)
            supa.save_site_result(
                analysis_id=analysis_id,
                user_id=user_id,
                geojson=geojson_out,
                sites=[
                    {"id": f["properties"].get("id"), "score": f["properties"].get("mcda_score")}
                    for f in result["features"]
                ],
                result={},
            )

        ws.cleanup()
        _REQUEST_STATUS[req_id] = {"status": "COMPLETED", "message": f"{len(result['features'])} sites"}

        # Record in-memory history when Supabase persistence is unavailable
        if not analysis_id:
            from datetime import datetime, timezone
            _IN_MEMORY_HISTORY.append({
                "id": f"inmem-{req_id}", "request_id": req_id,
                "analysis_type": "site", "status": "COMPLETED",
                "title": title,
                "origin_name": None, "origin_lat": req.location.lat,
                "origin_lon": req.location.lon,
                "destination_name": None, "destination_lat": None,
                "destination_lon": None,
                "infrastructure_type": None, "facility_type": facility_name,
                "result_summary": result_summary,
                "error_code": None, "error_message": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })

        return {
            "request_id": req_id,
            "analysis_id": analysis_id,
            "status": "COMPLETED",
            "sites": len(result["features"]),
            "facility_type": facility_name,
            "required_area_m2": required_area_m2,
            "min_pixels": result.get("min_pixels"),
            "total_candidates_evaluated": result.get("total_candidates_before_filter", 0),
            "geojson": geojson_out,
        }

    except Exception:
        tb = traceback.format_exc()
        logger.error("Unhandled site error:\n%s", tb)
        if analysis_id:
            supa.fail_analysis_run(analysis_id, "PROCESSING_FAILED", "Internal server error.")
        return _error(
            "PROCESSING_FAILED",
            "An internal error occurred during site finding.",
            getattr(ws, "request_id", None),
        )


# ---------------------------------------------------------------------------
# USER HISTORY — protected
# ---------------------------------------------------------------------------

@router.get("/user/history")
def get_history(user_id: str = Depends(get_current_user_id)):
    """
    Return the authenticated user's analysis history, newest first.
    Merges Supabase-persisted records with in-memory fallback records.
    user_id from JWT only — no cross-user access possible.
    """
    rows = supa.get_user_history(user_id, limit=50)
    # Merge in-memory history (records stored when Supabase is unavailable)
    all_rows = rows + _IN_MEMORY_HISTORY
    # Sort newest first
    all_rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"history": all_rows[:50], "count": len(all_rows)}


# ---------------------------------------------------------------------------
# STATUS (lightweight internal use)
# ---------------------------------------------------------------------------

@router.get("/status/{request_id}")
def get_status(request_id: str, user_id: str = Depends(get_current_user_id)):
    rec = _REQUEST_STATUS.get(request_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Unknown request_id")
    return {"request_id": request_id, "status": rec["status"], "message": rec["message"]}