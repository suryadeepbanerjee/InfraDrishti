# InfraDrishti

**Geospatial Intelligence for Smarter Infrastructure Planning**

InfraDrishti is a geospatial decision-support platform designed to help planners identify suitable infrastructure corridors and candidate sites using real-world spatial data and deterministic geospatial analysis.

## Core Capabilities

### Corridor Planner

Given an origin, destination, infrastructure type, and corridor width, InfraDrishti generates and ranks candidate NEW infrastructure corridors using:

- real geospatial datasets
- cost-surface analysis
- hard spatial constraints
- `MCP_Geometric` least-cost path analysis
- multiple alternative corridor generation
- corridor impact metrics
- transparent weighted MCDA ranking

The system is NOT an existing-road navigation router.

### Site Finder

Given a target location/AOI, facility type, required land area, and infrastructure requirements, InfraDrishti identifies spatially contiguous candidate sites and ranks them using:

- terrain
- population exposure
- buildings
- land cover
- water
- protected areas
- infrastructure proximity
- acquisition friction screening
- transparent MCDA

## Data Sources

The backend is designed around real geospatial datasets including:

- OpenStreetMap
- Copernicus DEM GLO-30
- ESA WorldCover
- HydroRIVERS
- HydroBASINS
- JRC Global Surface Water
- WorldPop
- WDPA / WD-OECM

## Important Disclaimer

InfraDrishti is a planning-support and decision-support tool.

It is NOT:

- legal ownership verification
- cadastral parcel verification
- final engineering design
- environmental clearance
- legal acquisition prediction
- compensation estimation

Population values are estimates.

`acquisition_friction_index` is a spatial screening proxy derived from available spatial indicators. It is NOT an ownership probability, acquisition probability, legal assessment, or financial estimate.

All real-world infrastructure decisions require appropriate survey, engineering, environmental, legal, and administrative validation.

## Architecture

```text
User Request
     ↓
Dynamic AOI
     ↓
Real Spatial Data
     ↓
Preprocessing
     ↓
Feature Engineering
     ↓
 ┌───────────────────────┐
 │                       │
 ▼                       ▼
Corridor Planner     Site Finder
 │                       │
 └───────────┬───────────┘
             ↓
            MCDA
             ↓
     Ranked + Explained
          Results
             ↓
          FastAPI
             ↓
        Frontend Map
```

## Repository Structure

- `backend/`
- `frontend/`
- `README.md`

The backend contains the geospatial processing and API implementation.
The frontend directory is intentionally reserved for the separate frontend implementation.

## Technology

- Python
- FastAPI
- GeoPandas
- Rasterio
- Shapely
- SciPy
- scikit-image
- PyProj

## Project Status

**Backend geospatial pipeline:** Validated

**Frontend:** Being developed separately
