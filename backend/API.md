# InfraDrishti Backend API Contract

Authoritative API contract for frontend integration. Processing is **synchronous**: a POST returns the final result directly (no polling required). Authentication is **Demo Mode** (out of scope).

## Base URL
All endpoints are prefixed with `/api/v1`. Local: `http://localhost:8000/api/v1`.

## CORS / Environment
- `FRONTEND_ORIGINS`: comma-separated allowed origins (default `http://localhost:5173,http://localhost:3000`).
- CORS never uses an unsafe production wildcard; origins are environment-configured.

## Validated data coverage
The validated cache covers approximately `lon 75.80–76.81, lat 17.89–18.61` (Latur–Osmanabad, Maharashtra) at 50 m resolution. Requests whose endpoints/centre fall outside this AOI return `DATA_COVERAGE_BLOCKER` (HTTP 422). No geographically incorrect data is ever substituted.

## Endpoints

### `GET /health`
```json
{ "status": "ok", "service": "infradrishti-backend", "version": "1.0.0" }
```

### `GET /status/{request_id}`
Returns the session-local status record for a request_id (synchronous requests complete before returning).
```json
{ "request_id": "2026...", "status": "COMPLETED", "message": "3 routes" }
```
Unknown ids return 404.

### `POST /corridor/plan`
```json
{
  "infrastructure_type": "highway",
  "origin": { "name": "Latur", "lon": 76.5726, "lat": 18.4088 },
  "destination": { "name": "Osmanabad", "lon": 76.0395, "lat": 18.1814 },
  "corridor_width_m": 500,
  "n_routes": 3,
  "mcda_weights": { "route_length_km": 2.0 }
}
```
- `infrastructure_type`: `highway` | `railway` | `power_transmission` (display names are normalized).
- `mcda_weights` (optional): user-supplied metric weights. Backend validates (known names, numeric, non-negative), merges over profile defaults, and re-normalises to sum 1.0. Confirmed weights are returned per route.

**Response**
```json
{
  "request_id": "2026...",
  "status": "COMPLETED",
  "routes": 3,
  "infrastructure_type": "highway",
  "corridor_width_m": 500,
  "n_routes": 3,
  "geojson": { "type": "FeatureCollection", "features": [ { "type": "Feature", "properties": {
      "id": "R-1", "rank": 1, "mcda_score": 0.69,
      "metrics": { "route_length_km": 67.1, "population_exposure": 123, "acquisition_friction_index": 0.2 },
      "normalized_metrics": {}, "weights": {}, "weighted_contributions": {},
      "mcda_math_check": true, "origin_error_m": 30.9, "destination_error_m": 28.0,
      "explanation": { "text": "### WHY THIS ROUTE RANKS HIGHEST ..." },
      "provenance": {}
    }, "geometry": { "type": "LineString", "coordinates": [ [lon, lat], ... ] } } ] },
  "diversity_metrics": [ { "pair": ["R-1","R-2"], "jaccard_overlap": 0.05, "is_diverse": true } ],
  "failed_attempts": []
}
```
GeoJSON is always **EPSG:4326** with `[longitude, latitude]` coordinate order.

### `POST /site/find`
```json
{
  "facility_type": "Logistics Hub",
  "location": { "lat": 18.4088, "lon": 76.5726 },
  "required_area_acres": 50,
  "mcda_weights": {}
}
```
- `facility_type`: `Logistics Hub` | `Manufacturing Plant` | `Data Center Campus` | `Renewable Solar Park` (normalized to a facility profile).
- `required_area_m2` or `required_area_acres` (acres override). The minimum contiguous area threshold is dynamic: `min_pixels = ceil(area_m2 / 2500)`.

**Response**
```json
{
  "request_id": "2026...",
  "status": "COMPLETED",
  "sites": 5,
  "facility_type": "logistics_hub",
  "required_area_m2": 202342.8,
  "min_pixels": 81,
  "total_candidates_evaluated": 4837,
  "geojson": { "type": "FeatureCollection", "features": [ { "type": "Feature", "properties": {
      "id": "SITE-1", "rank": 1, "mcda_score": 0.747,
      "metrics": { "site_area_ha": 300.0, "dist_to_highway_m": 0.0, "acquisition_friction_index": 0.2 },
      "normalized_metrics": {}, "weights": {}, "weighted_contributions": {},
      "mcda_math_check": true, "explanation": { "text": "### WHY THIS SITE RANKS HIGHEST ..." },
      "provenance": {}
    }, "geometry": { "type": "Polygon", "coordinates": [ ... ] } } ] }
}
```
Candidates are contiguous planning areas, **not** legal cadastral parcels.

## Error handling
Structured errors:
```json
{ "error": { "code": "...", "message": "...", "request_id": "..." } }
```
Codes: `INVALID_REQUEST`, `VALIDATION_FAILED`, `DATA_COVERAGE_BLOCKER` (422), `NO_VALID_ROUTE`, `NO_SUITABLE_SITE`, `PROCESSING_FAILED`, `REQUEST_TOO_LARGE`, `DOWNLOAD_FAILED`, `BACKEND_UNAVAILABLE`.
No tracebacks, filesystem paths, or internal exception details are exposed to the client.