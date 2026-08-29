from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class PointConfig(BaseModel):
    name: str
    lon: float
    lat: float

class CorridorRequest(BaseModel):
    infrastructure_type: str
    origin: PointConfig
    destination: PointConfig
    corridor_width_m: float
    profile: Optional[Dict[str, Any]] = None
    n_routes: int = 3

class ProximityConstraints(BaseModel):
    max_dist_to_highway_m: float = 10000.0
    max_dist_to_railway_m: float = 10000.0
    max_slope_deg: float = 15.0

class SiteRequest(BaseModel):
    facility_type: str
    required_area_m2: float
    proximity_constraints: ProximityConstraints