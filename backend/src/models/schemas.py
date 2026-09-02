from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union

class PointConfig(BaseModel):
    name: Optional[str] = "Location"
    lon: float
    lat: float

class CorridorRequest(BaseModel):
    infrastructure_type: str = Field(..., description="e.g. highway, railway, power_transmission")
    origin: PointConfig
    destination: PointConfig
    corridor_width_m: float = 50.0
    profile: Optional[Dict[str, Any]] = None
    n_routes: int = 5
    mcda_weights: Optional[Dict[str, float]] = None

class ProximityConstraints(BaseModel):
    max_dist_to_highway_m: float = 10000.0
    max_dist_to_railway_m: float = 10000.0
    max_slope_deg: float = 15.0

class LocationConfig(BaseModel):
    lat: float
    lon: float

class SiteRequest(BaseModel):
    facility_type: str = Field(..., description="e.g. logistics_hub, manufacturing_plant, data_center, solar_park")
    location: Optional[LocationConfig] = None
    required_area_m2: float = 202343.0  # ~50 acres
    required_area_acres: Optional[float] = None  # alternate unit
    proximity_constraints: Optional[ProximityConstraints] = None
    requirements: Optional[Dict[str, Any]] = None
    mcda_weights: Optional[Dict[str, float]] = None

class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: Union[List, List[List], List[List[List]]]

class FeatureProperty(BaseModel):
    id: str
    rank: int
    mcda_score: float
    metrics: Dict[str, Any]
    normalized_metrics: Dict[str, float]
    weights: Dict[str, float]
    weighted_contributions: Dict[str, float]
    explanation: Dict[str, Any]
    provenance: Any

class Feature(BaseModel):
    type: str = "Feature"
    properties: FeatureProperty
    geometry: GeoJSONGeometry

class FeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[Feature]

class CorridorResponse(BaseModel):
    request_id: str
    status: str
    routes: List[Dict[str, Any]]
    geojson: FeatureCollection

class SiteResponse(BaseModel):
    request_id: str
    status: str
    sites: List[Dict[str, Any]]
    geojson: FeatureCollection

class StatusResponse(BaseModel):
    request_id: str
    status: str
    message: str
    progress: int

class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: Optional[str] = None

class ErrorResponse(BaseModel):
    error: ErrorDetail
