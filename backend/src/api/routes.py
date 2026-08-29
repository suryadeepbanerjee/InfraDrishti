from fastapi import APIRouter, HTTPException
from src.models.schemas import CorridorRequest, SiteRequest
from src.corridor.planner import run_corridor_planner
from src.site.finder import run_site_finder

router = APIRouter()

@router.post("/project")
def create_project():
    return {"status": "Project initialized", "message": "Using local workspace"}

@router.post("/corridor/plan")
def plan_corridor(req: CorridorRequest):
    try:
        return run_corridor_planner(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/site/find")
def find_site(req: SiteRequest):
    try:
        return run_site_finder(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
