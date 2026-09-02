import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(
    title="InfraDrishti API",
    description="Geospatial Intelligence Engine for Infrastructure Planning",
    version="1.0.0"
)

# CORS Configuration
origins_str = os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000")
origins = [o.strip() for o in origins_str.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")

@app.on_event("startup")
def _check_supabase_config():
    """Warn at startup if Supabase credentials are missing — persistence will be disabled."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        logger.warning(
            "SUPABASE_URL or SUPABASE_SECRET_KEY is not set. "
            "Analysis requests will still work, but results will NOT be persisted to Supabase. "
            "Set these in backend/.env to enable user history and result storage."
        )

@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "service": "infradrishti-backend",
        "version": "1.0.0"
    }
