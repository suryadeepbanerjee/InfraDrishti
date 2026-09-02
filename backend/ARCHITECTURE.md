# Infrastructure Intelligence Platform — Architecture Specification

**[Infrastructure Intelligence Platform — Build Agent | Phase: Architecture]**

> **This file is the source of truth for all implementation phases. All code must conform to the
> specifications, naming conventions, constraints, and output schemas defined here. If any
> real-world data or library behaviour conflicts with this spec, stop and document the conflict
> rather than silently working around it.**

---

## 1. Disclaimer (Mandatory — Must Appear in All Outputs)

This system is a **planning-support tool only**. It is:
- **NOT** legal ownership verification
- **NOT** final engineering design
- **NOT** environmental clearance or regulatory approval

Population figures are estimates from WorldPop 2020. The `acquisition_friction_index` is a
spatial proxy/screening index derived from building density, population exposure, land-use
classification, and protected-area proximity. It is **not** an acquisition probability,
ownership probability, or legal/financial claim. All results require expert review, legal survey,
and engineering validation before any real construction activity.

---

## 2. System Overview

Two deterministic geospatial decision-support engines:

| Engine | Purpose | Core Algorithm |
|---|---|---|
| **Corridor Planner** | Generate 3-5 candidate NEW infrastructure corridor alignments | `skimage.graph.MCP_Geometric` (least-cost path) + iterative penalty for diversity |
| **Site Finder** | Find contiguous candidate sites meeting minimum area and proximity criteria | Binary mask → `scipy.ndimage.label` (connected components) → area filter |

**Hard constraints:**
- No ML models. No trained weights. No road routers (OSRM or similar).
- Corridor ranking and site ranking are deterministic MCDA.
- Hard exclusion zones use `np.inf` in the cost raster — never an arbitrarily large finite number.
- No silent fallback to fake/sample data. Any mandatory dataset failure stops the pipeline.

---

## 3. Demo AOI

| Parameter | Value |
|---|---|
| **Region** | Latur–Osmanabad (Dharashiv) district corridor, Maharashtra, India |
| **Bounding box (WGS84)** | `[75.8, 17.9, 76.8, 18.6]` (west, south, east, north) |
| **UTM zone** | 43N — EPSG:32643 |
| **Grid resolution** | 50 m |
| **Grid dimensions (approx)** | ~2200 × 1555 pixels |
| **Corridor demo origin** | Latur city — 76.57°E, 18.40°N |
| **Corridor demo destination** | Osmanabad city — 76.04°E, 18.18°N |
| **Corridor width** | 500 m (highway default) |
| **Infrastructure profile** | highway |
| **Site min area** | 50 acres = 20.2343 ha = 202,343 m² |
| **Site proximity constraint** | Within 5 km of primary/secondary highway (from OSM) |

Both origin and destination lie within the AOI bbox. This was verified prior to implementation.

---

## 4. Folder Structure

```
redflag/
├── ARCHITECTURE.md          ← This file. Source of truth.
├── README.md
├── requirements.txt
├── environment.yml
├── setup_project.py         ← Creates all directories
├── run_pipeline.py          ← Single-command runner
├── run_all.py               ← Full end-to-end runner
│
├── configs/
│   ├── aoi_config.yaml
│   └── infrastructure_profiles.yaml
│
├── data/
│   ├── raw/                 ← Downloaded files, never modified
│   ├── interim/             ← Reprojected/clipped, not yet aligned
│   ├── processed/           ← Fully aligned 50m UTM rasters + cleaned vectors
│   │   └── cost_components/ ← Per-layer cost contribution rasters
│   └── metadata/
│       └── data_sources.yaml  ← Mandatory provenance record
│
├── models/
│   ├── corridor_config.json   ← Weights/profile used (no trained weights)
│   └── site_config.json
│
├── outputs/
│   ├── routes.geojson
│   ├── routes.csv
│   ├── route_explanations.json
│   ├── route_cost_surface.tif
│   ├── sites.geojson
│   ├── sites.csv
│   ├── site_explanations.json
│   └── processing_summary.json
│
├── scripts/
│   ├── download_data.py
│   └── preprocess_data.py
│
├── src/
│   ├── acquisition/
│   │   ├── __init__.py
│   │   ├── downloader.py
│   │   └── friction.py
│   ├── preprocessing/
│   │   ├── __init__.py
│   │   ├── validate.py
│   │   ├── reproject.py
│   │   ├── clip.py
│   │   └── align.py
│   ├── geospatial/
│   │   ├── __init__.py
│   │   ├── slope.py
│   │   ├── building_density.py
│   │   ├── population.py
│   │   ├── land_cover.py
│   │   ├── hydrology.py
│   │   ├── protected_areas.py
│   │   └── osm_infrastructure.py
│   ├── corridor/
│   │   ├── __init__.py
│   │   ├── cost_surface.py
│   │   ├── planner.py
│   │   └── zonal_stats.py
│   ├── site/
│   │   ├── __init__.py
│   │   ├── finder.py
│   │   └── zonal_stats.py
│   ├── scoring/
│   │   ├── __init__.py
│   │   └── mcda.py
│   ├── inference/
│   │   ├── __init__.py
│   │   └── output_writer.py
│   └── ml/                  ← Reserved namespace; empty. No ML in this system.
│       └── __init__.py
│
└── tests/
    ├── __init__.py
    ├── conftest.py           ← Synthetic fixture AOI (no real downloads)
    ├── fixtures/             ← Synthetic rasters/vectors for tests
    ├── test_geometry.py
    ├── test_crs.py
    ├── test_raster_alignment.py
    ├── test_cost_surface.py
    ├── test_corridor.py
    ├── test_site.py
    ├── test_scoring.py
    └── test_hard_constraints.py
```

---

## 5. Datasets

Every dataset download **must** append an entry to `data/metadata/data_sources.yaml`.
Failure to do so is a bug. The schema for each entry:

```yaml
- dataset: <name>
  source: <institution>
  download_url: <exact URL used>
  license: <SPDX or short description>
  date_downloaded: <ISO8601 date>
  source_date: <data vintage, e.g. "2021">
  resolution: <e.g. "30m" or "vector">
  coverage: <e.g. "Asia" or "Global">
  notes: <any caveats, e.g. "WDPA unavailable — token not received">
```

### 5.1 Dataset Table

| Dataset | Source | Auth | Notes |
|---|---|---|---|
| Maharashtra OSM PBF | `https://download.geofabrik.de/asia/india/maharashtra-latest.osm.pbf` | None | Updated daily; ODbL |
| Copernicus DEM GLO-30 | `s3://copernicus-dem-30m/` `--no-sign-request` | None | 1°×1° tiles, eu-central-1 |
| ESA WorldCover 2021 v200 | `s3://esa-worldcover/v200/2021/map` `--no-sign-request` | None | 10m, CC-BY 4.0 |
| HydroRIVERS Asia | `https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip` | None | 91 MB shapefile; confirmed from live page |
| HydroBASINS Asia (Level 12) | `https://data.hydrosheds.org/file/HydroBASINS/standardized/hybas_as_lev12_v1c.zip` | None | ~100MB shapefile |
| JRC Global Surface Water v1.5 | `https://s3.waw4-1.cloudferro.com/swift/v1/global-surface-water/download2024/Aggregated/VER1-5/occurrence/occurrence_{lon}E_{lat}N_v1_5_2024.tif` | None | 10°×10° tiles; tile for AOI: 80E\_20N |
| WorldPop India 2020 (100m) | `https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/IND/ind_ppp_2020.tif` | None | Confirmed by browser navigation |
| WDPA Protected Areas | `https://www.protectedplanet.net` | **LOGIN REQUIRED** | Free API token; pipeline pauses |
| LACRRIS | Dept of Land Resources PDFs | No bulk download | Optional; skip if not extractable |
| OSM buildings | Bundled in Maharashtra PBF | None | No separate step |

### 5.2 Copernicus DEM Tile Naming

Tiles are 1°×1°, naming format:
```
Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM/
  Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM.tif
```

For AOI [75.8, 17.9, 76.8, 18.6] → lat rows N17, N18; lon cols E075, E076.
That is 4 tiles. The download script lists them programmatically from the bbox.

### 5.3 ESA WorldCover Tile Naming

Tiles are 3°×3°. Named by lower-left corner rounded to 3° increments:
```
ESA_WorldCover_10m_2021_v200_{lat_prefix}{lat}{lon_prefix}{lon}_Map.tif
```
e.g. `ESA_WorldCover_10m_2021_v200_N18E075_Map.tif`

The download script lists available tiles via `aws s3 ls --no-sign-request s3://esa-worldcover/v200/2021/map/` and downloads only those intersecting the AOI.

---

## 6. Coordinate Reference System and Grid

| Property | Value |
|---|---|
| Processing CRS | EPSG:32643 (WGS 84 / UTM zone 43N) |
| Output CRS | EPSG:4326 (WGS84 geographic) for GeoJSON; EPSG:32643 for rasters |
| Grid resolution | 50 m (all analysis rasters must be aligned to this grid) |
| Resampling — continuous layers | Bilinear (DEM, population, slope) |
| Resampling — categorical layers | Nearest-neighbour (land cover, protected areas, buildings) |
| No-data value | `np.nan` for float rasters; `255` for uint8 |
| Hard-constraint value | `np.inf` in cost raster — never a finite large number |

All raw rasters are reprojected and clipped to the AOI → saved to `data/interim/`, then
aligned to the reference grid (from the Copernicus DEM after reprojection) → saved to
`data/processed/`.

---

## 7. Pipeline Stages

```
raw/                →   validate & reproject & clip (UTM/clip to AOI)   →   interim/
interim/            →   align all rasters to reference grid              →   processed/
processed/          →   feature engineering (slope, density, etc.)       →   processed/cost_components/
processed/          →   cost surface construction                         →   outputs/route_cost_surface.tif
route_cost_surface  →   MCP_Geometric → 3-5 routes                       →   outputs/routes.*
processed/          →   binary mask → connected components → sites        →   outputs/sites.*
```

---

## 8. Corridor Planner Algorithm

### 8.1 Cost Layers and Weights (Highway Profile)

| Layer | Type | Hard Constraint? | Weight |
|---|---|---|---|
| slope_cost | continuous [0,1] from degrees | No | 0.20 |
| building_density | continuous [0,1] | No | 0.15 |
| population_exposure | continuous [0,1] | No | 0.10 |
| land_cover_cost | lookup from class | Class 80 (water) = inf | 0.15 |
| river_crossing | binary (0/1) | No | 0.10 |
| surface_water_permanent | binary | inf if occ ≥ 50% | — |
| protected_area | binary | inf if WDPA polygon | — |
| acquisition_friction_index | composite [0,1] | No | 0.20 |
| dist_to_highway | continuous [0,1] (inverse) | No | 0.10 |

Land-cover cost lookup (ESA WorldCover 2021 class codes):

| ESA Class | Description | Cost |
|---|---|---|
| 10 | Tree cover (forest) | 0.60 |
| 20 | Shrubland | 0.30 |
| 30 | Grassland | 0.10 |
| 40 | Cropland | 0.40 |
| 50 | Built-up | 0.90 |
| 60 | Bare/sparse vegetation | 0.05 |
| 70 | Snow and ice | 0.70 |
| 80 | Permanent water bodies | `np.inf` |
| 90 | Herbaceous wetland | 0.80 |
| 95 | Mangroves | 0.90 |
| 100 | Moss and lichen | 0.30 |

### 8.2 MCP_Geometric Algorithm

```python
from skimage.graph import MCP_Geometric
import numpy as np

mcp = MCP_Geometric(cost_surface)          # cost_surface is float32 2D array
cumcost, _ = mcp.find_costs([origin_px])   # origin_px = (row, col)
path = mcp.traceback(destination_px)       # list of (row, col) tuples
```

For `np.inf` cells: MCP_Geometric will never route through them because their cumulative
cost is `np.inf` — the path will be forced around them. This is the correct hard-constraint
behaviour.

### 8.3 Route Diversity (Iterative Penalty)

For routes 2 through N:
1. Create a penalty array initialised to zeros, same shape as cost surface.
2. For each existing route pixel trace, add a Gaussian footprint: `penalty += A * exp(-dist²/(2σ²))`.
   - σ = 10 cells (500 m at 50 m resolution)
   - A (amplitude) increases with each iteration: A = base_amplitude * iteration_number.
3. Add penalty to cost surface: `penalised = cost_surface + penalty`.
4. Run MCP_Geometric on penalised surface, traceback → new candidate route.
5. Check diversity: if buffered overlap with any existing route > 60% of the smaller route's
   area, increment A and retry (up to 10 retries).
6. If after 10 retries no diverse route is found, stop and report the actual number of
   diverse routes found — do not return near-duplicates.

### 8.4 Route Output Schema

Each route feature in `routes.geojson`:
```json
{
  "type": "Feature",
  "geometry": {"type": "LineString", "coordinates": [...]},
  "properties": {
    "route_id": 1,
    "rank": 1,
    "mcda_score": 0.312,
    "route_length_km": 82.4,
    "building_count": 234,
    "building_area_sqm": 18500,
    "population_exposure": 12400,
    "mean_slope_deg": 2.1,
    "max_slope_deg": 8.7,
    "river_crossings": 3,
    "waterbody_overlap_km2": 0.0,
    "protected_area_overlap_km2": 0.0,
    "forest_overlap_km2": 4.2,
    "cropland_overlap_km2": 22.1,
    "dist_to_highway_m": 340,
    "dist_to_railway_m": 1200,
    "dist_to_station_m": 4500,
    "dist_to_power_m": 800,
    "acquisition_friction_index": 0.34,
    "infrastructure_type": "highway",
    "corridor_width_m": 500,
    "wdpa_available": true
  }
}
```

---

## 9. Site Finder Algorithm

### 9.1 Hard Constraint Mask

Cells excluded (set to 0 in binary mask):
- Permanent water (JRC GSW occurrence ≥ 50%)
- Protected areas (WDPA polygon cells, if WDPA available)
- ESA WorldCover class 50 (Built-up) and 80 (Permanent water)
- Slope > 15° (too steep for most infrastructure sites)

Cells included (set to 1):
- All remaining cells within the AOI

### 9.2 Contiguity Requirement

```python
from scipy.ndimage import label

structure = np.ones((3, 3), dtype=int)  # 8-connectivity
labelled, n_components = label(binary_mask, structure=structure)

pixel_area_m2 = resolution_m ** 2       # 50 * 50 = 2500 m²
min_pixels = math.ceil(required_area_m2 / pixel_area_m2)

for component_id in range(1, n_components + 1):
    component_pixels = np.sum(labelled == component_id)
    if component_pixels >= min_pixels:
        # this is a valid candidate site
```

A site is **spatially contiguous** — it is a single connected component. Scattered cells that
sum to the target area are explicitly rejected by this algorithm.

### 9.3 Proximity Filter

```python
from scipy.ndimage import distance_transform_edt

# highway_presence is a boolean raster (True where highway pixel exists)
dist_to_highway = distance_transform_edt(~highway_presence) * pixel_size_m
proximity_mask = dist_to_highway <= max_dist_m
# Apply: combined_mask = binary_mask & proximity_mask
```

### 9.4 Site Minimum Area

Demo: **50 acres = 20.2343 ha = 202,343 m²**
At 50m grid: minimum 81 contiguous pixels.

### 9.5 Site Output Schema

Each site feature in `sites.geojson`:
```json
{
  "type": "Feature",
  "geometry": {"type": "Polygon", "coordinates": [...]},
  "properties": {
    "site_id": 1,
    "rank": 1,
    "mcda_score": 0.278,
    "site_area_ha": 24.5,
    "site_area_acres": 60.5,
    "compactness_index": 0.72,
    "mean_slope_deg": 1.2,
    "max_slope_deg": 4.1,
    "population_within_1km": 3200,
    "building_count": 12,
    "building_area_sqm": 840,
    "dist_to_highway_m": 1200,
    "dist_to_railway_m": 4500,
    "dist_to_power_m": 2300,
    "land_cover_composition": {"cropland": 0.75, "grassland": 0.25},
    "protected_area_overlap_km2": 0.0,
    "acquisition_friction_index": 0.28,
    "infrastructure_type": "highway",
    "wdpa_available": true
  }
}
```

---

## 10. MCDA Scoring

Both corridor and site candidates are ranked using the same normalised weighted-sum MCDA:

1. Collect all candidates' metric values into a table.
2. For each metric, compute min-max normalisation across the candidate set:
   - `normalised = (value - min) / (max - min)` if direction = "minimise"
   - `normalised = (max - value) / (max - min)` if direction = "maximise"
   - If all values are identical (range = 0), set normalised = 0.5 for all.
3. Weighted sum: `mcda_score = sum(weight_i * normalised_i)`
4. Sort ascending by `mcda_score` (rank 1 = lowest score = best candidate).
5. Write `route_explanations.json` / `site_explanations.json` showing each metric's
   raw value, normalised value, weight, and weighted contribution for every candidate.

---

## 11. `acquisition_friction_index` Specification

**Named exactly `acquisition_friction_index` in all code, configs, and outputs.**

Never call it: acquisition probability, ownership probability, parcel probability, or any
variant suggesting legal or financial certainty.

Formula:
```
acquisition_friction_index = (
    0.35 * normalise(building_density_kernel)   +
    0.25 * normalise(population_exposure)        +
    0.25 * landuse_friction(esa_landcover_class) +
    0.15 * protected_area_proximity_score
)
```

Land-use friction scores for the formula:
| ESA class | friction |
|---|---|
| 50 (Built-up) | 1.0 |
| 40 (Cropland) | 0.6 |
| 10 (Tree cover) | 0.5 |
| 90 (Wetland) | 0.4 |
| 95 (Mangrove) | 0.7 |
| 20 (Shrubland) | 0.2 |
| 30 (Grassland) | 0.1 |
| 60 (Bare) | 0.05 |
| 80 (Water) | 0.9 |
| other | 0.3 |

Protected-area proximity score: linear decay from 1.0 (inside WDPA buffer) to 0.0 at 5 km distance.
If WDPA unavailable: this component is set to 0.0 and noted in metadata.

---

## 12. Output Files

| File | Description |
|---|---|
| `outputs/routes.geojson` | All corridor candidates (LineString, WGS84) |
| `outputs/routes.csv` | Same, tabular form |
| `outputs/route_explanations.json` | Per-route MCDA breakdown |
| `outputs/route_cost_surface.tif` | Full cost raster (float32, EPSG:32643) |
| `outputs/sites.geojson` | All site candidates (Polygon, WGS84) |
| `outputs/sites.csv` | Same, tabular form |
| `outputs/site_explanations.json` | Per-site MCDA breakdown |
| `outputs/processing_summary.json` | Run metadata, dataset flags, runtime |
| `models/corridor_config.json` | Weights and profile used |
| `models/site_config.json` | Weights and profile used |
| `data/metadata/data_sources.yaml` | Full dataset provenance |

---

## 13. Test Requirements

All tests run against a **synthetic 50×50 pixel fixture** (UTM 43N, 50m resolution).
No real dataset downloads are needed for the test suite.

| Test file | What it verifies |
|---|---|
| `test_geometry.py` | Route geometries are valid and non-self-intersecting; site geometries are valid polygons |
| `test_crs.py` | All GeoJSON outputs are EPSG:4326; all processed rasters are EPSG:32643 |
| `test_raster_alignment.py` | All processed rasters share identical transform, shape, and CRS |
| `test_cost_surface.py` | Constraint cells produce `np.inf` (not finite large numbers); traversable cells are finite ≥ 0 |
| `test_corridor.py` | ≥ 3 routes generated; routes are spatially distinct (pairwise buffered overlap < 60%); no route passes through `np.inf` cells |
| `test_site.py` | Sites are spatially contiguous; sites meet minimum area; no site overlaps excluded cells |
| `test_scoring.py` | MCDA scores are numerically correct; rank 1 has lowest score; explanation JSON is complete |
| `test_hard_constraints.py` | Protected-area and permanent-water cells are `np.inf`; no route or site overlaps them |

---

## 14. Prohibited Patterns

- **No ML/trained model files**: `models/` contains only JSON config files.
- **No fabricated URLs**: all URLs were either provided in the spec or confirmed by live page navigation.
- **No OSRM or road routing**: MCP_Geometric on a cost raster only.
- **No large finite numbers as hard constraints**: use `np.inf` exclusively.
- **No silent fallback to sample data**: any mandatory download failure must raise `DataAcquisitionError`.
- **No alternate names for acquisition_friction_index**: exact string, always.
- **No parcel-level claims from LACRRIS**: project-level PDFs only, clearly labelled.

---

## 15. Dependencies

```
# Core geospatial
rasterio>=1.3
shapely>=2.0
geopandas>=0.14
pyproj>=3.6
fiona>=1.9

# Algorithms
scikit-image>=0.21    # MCP_Geometric
scipy>=1.11           # ndimage.label, distance_transform_edt
numpy>=1.24
pandas>=2.0

# OSM processing
pyosmium>=3.6

# Zonal statistics
rasterstats>=0.19

# Config and I/O
pyyaml>=6.0
requests>=2.31
tqdm>=4.66

# Testing
pytest>=7.4
pytest-cov>=4.1

# Raster utilities (system; install via conda)
# gdal>=3.7
# osmium-tool>=1.15
```
