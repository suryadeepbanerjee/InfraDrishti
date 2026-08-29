"""
Infrastructure Intelligence Platform — Data Download Orchestrator

Downloads all mandatory datasets for the demo AOI.
Runs sequentially; pauses at login-gated sources per the project protocol.

Usage:
    python scripts/download_data.py

Mandatory datasets (pipeline halts on failure, no fake-data fallback):
    1. Maharashtra OSM PBF (Geofabrik)
    2. Copernicus DEM GLO-30 (AWS S3, public)
    3. ESA WorldCover 2021 v200 (AWS S3, public)
    4. HydroRIVERS Asia (HydroSHEDS direct link)
    5. JRC Global Surface Water v1.5 occurrence tile
    6. WorldPop India 2020 100m (direct URL, browser-confirmed)

Login-gated datasets (pipeline pauses):
    7. WDPA Protected Areas (requires protectedplanet.net API token)

Optional datasets:
    8. LACRRIS — no bulk download; note as unavailable
"""

from __future__ import annotations

import logging
import math
import os
import sys
import zipfile
from pathlib import Path

# Allow running as a script from the project root
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import yaml

from src.acquisition.downloader import (
    DataAcquisitionError,
    append_data_source_record,
    download_http,
    download_s3_no_auth,
    download_s3_prefix,
    list_s3_prefix,
    today_iso,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("download_data")

# ─── Paths ────────────────────────────────────────────────────────────────────
RAW = ROOT / "data" / "raw"
METADATA = ROOT / "data" / "metadata"

# ─── Demo AOI (from configs/aoi_config.yaml) ──────────────────────────────────
# WGS84 bounding box [west, south, east, north]
AOI_WEST  = 75.8
AOI_SOUTH = 17.9
AOI_EAST  = 76.8
AOI_NORTH = 18.6

# ─── Confirmed download URLs (verified from live pages or spec) ────────────────
MAHARASHTRA_PBF_URL = (
    "https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf"
)
HYDRORIVERS_ASIA_URL = (
    "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip"
)
# WorldPop — URL verified by browser navigation on 2026-08-29
WORLDPOP_INDIA_URL = (
    "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/IND/ind_ppp_2020.tif"
)
# JRC Global Surface Water v1.5 (2024 release) — URL confirmed from live page source
JRC_GSW_BASE = (
    "https://s3.waw4-1.cloudferro.com/swift/v1/global-surface-water/"
    "download2024/Aggregated/VER1-5"
)

# ─── Copernicus DEM S3 configuration ─────────────────────────────────────────
COP_DEM_BUCKET = "s3://copernicus-dem-30m"
COP_DEM_REGION = "eu-central-1"

# ─── ESA WorldCover S3 configuration ─────────────────────────────────────────
WORLDCOVER_BUCKET = "s3://esa-worldcover"
WORLDCOVER_PREFIX = "v200/2021/map"
WORLDCOVER_REGION = "eu-central-1"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _cop_dem_tiles(west: float, south: float, east: float, north: float) -> list[tuple[int, int]]:
    """Return (lat, lon) integer pairs for all 1°×1° DEM tiles intersecting the bbox."""
    lat_min = math.floor(south)
    lat_max = math.ceil(north) - 1
    lon_min = math.floor(west)
    lon_max = math.ceil(east) - 1
    tiles = []
    for lat in range(lat_min, lat_max + 1):
        for lon in range(lon_min, lon_max + 1):
            tiles.append((lat, lon))
    return tiles


def _cop_dem_s3_key(lat: int, lon: int) -> str:
    """Construct S3 key for a Copernicus DEM GLO-30 tile."""
    lat_prefix = "N" if lat >= 0 else "S"
    lon_prefix = "E" if lon >= 0 else "W"
    folder = (
        f"Copernicus_DSM_COG_10_{lat_prefix}{abs(lat):02d}_00_"
        f"{lon_prefix}{abs(lon):03d}_00_DEM"
    )
    filename = folder + ".tif"
    return f"{folder}/{filename}"


def _jrc_gsw_tile_url(west: float, south: float, east: float, north: float) -> list[str]:
    """Compute JRC GSW tile URLs for the AOI.

    Tiles are 10°×10°, named by their top-left corner (upper-left x/y).
    URL format: occurrence_{lon}E_{lat}N_v1_5_2024.tif
    where lon = left edge (floored to 10°), lat = top edge (ceiled to 10°).
    """
    urls = []
    lon_start = math.floor(west / 10) * 10
    lon_end   = math.ceil(east / 10) * 10
    lat_start = math.ceil(north / 10) * 10   # top-left convention: lat is upper
    lat_end   = math.floor(south / 10) * 10

    lon = lon_start
    while lon < lon_end:
        lat = lat_end
        while lat <= lat_start:
            lon_str = f"{abs(lon)}{'W' if lon < 0 else 'E'}"
            lat_str = f"{abs(lat)}{'S' if lat < 0 else 'N'}"
            url = (
                f"{JRC_GSW_BASE}/occurrence/occurrence_{lon_str}_{lat_str}_v1_5_2024.tif"
            )
            urls.append(url)
            lat += 10
        lon += 10
    return urls


def _extract_zip(zip_path: Path, dest_dir: Path) -> None:
    logger.info("Extracting %s → %s", zip_path.name, dest_dir)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest_dir)


# ─── Step functions ───────────────────────────────────────────────────────────

def step1_osm_maharashtra() -> Path:
    """Download Maharashtra OSM PBF from Geofabrik."""
    logger.info("=" * 60)
    logger.info("STEP 1: Maharashtra OSM PBF (Geofabrik)")
    dest = RAW / "maharashtra-latest.osm.pbf"

    download_http(MAHARASHTRA_PBF_URL, dest)

    if dest.stat().st_size < 10 * 1024 * 1024:
        raise DataAcquisitionError(
            f"OSM PBF file {dest} is suspiciously small ({dest.stat().st_size} bytes). "
            f"It may be a corrupted download or an HTML error page."
        )

    append_data_source_record({
        "dataset": "Maharashtra OSM PBF",
        "source": "Geofabrik / OpenStreetMap contributors",
        "download_url": MAHARASHTRA_PBF_URL,
        "license": "ODbL 1.0",
        "date_downloaded": today_iso(),
        "source_date": "daily",
        "resolution": "vector",
        "coverage": "Maharashtra state, India",
        "notes": "Used for: roads, railways, buildings, power lines. Clipped to AOI during preprocessing.",
    })
    logger.info("STEP 1 complete: %s", dest)
    return dest


def step2_copernicus_dem() -> list[Path]:
    """Download Copernicus DEM GLO-30 tiles covering the AOI.

    Primary: public S3 bucket s3://copernicus-dem-30m
    Fallback: OpenTopography API (LOGIN REQUIRED — halt and notify user)
    """
    logger.info("=" * 60)
    logger.info("STEP 2: Copernicus DEM GLO-30 (AWS S3, no auth)")

    tiles = _cop_dem_tiles(AOI_WEST, AOI_SOUTH, AOI_EAST, AOI_NORTH)
    logger.info("Tiles to download: %s", tiles)

    downloaded = []
    for lat, lon in tiles:
        key = _cop_dem_s3_key(lat, lon)
        s3_uri = f"{COP_DEM_BUCKET}/{key}"
        lat_prefix = "N" if lat >= 0 else "S"
        lon_prefix = "E" if lon >= 0 else "W"
        dest = (
            RAW / "copernicus_dem" /
            f"cop_dem_{lat_prefix}{abs(lat):02d}_{lon_prefix}{abs(lon):03d}.tif"
        )
        try:
            download_s3_no_auth(s3_uri, dest, region=COP_DEM_REGION)
            downloaded.append(dest)
        except DataAcquisitionError as exc:
            # S3 primary route failed — apply LOGIN REQUIRED fallback protocol
            ot_api_key = os.environ.get("OT_API_KEY", "").strip()
            if not ot_api_key:
                logger.error("=" * 60)
                logger.error("COPERNICUS DEM S3 DOWNLOAD FAILED")
                logger.error("S3 URI: %s", s3_uri)
                logger.error("Error: %s", exc)
                logger.error("")
                logger.error("FALLBACK: OpenTopography Global DEM API (LOGIN REQUIRED)")
                logger.error("Please open a browser and navigate to:")
                logger.error("  https://portal.opentopography.org")
                logger.error("Action required: Create a free account and generate an API key.")
                logger.error("Once you have the key, set it in the environment variable:")
                logger.error("  OT_API_KEY=<your-key>")
                logger.error("Then re-run this script.")
                logger.error("=" * 60)
                raise DataAcquisitionError(
                    "Copernicus DEM S3 download failed. "
                    "OpenTopography fallback requires a LOGIN — see above for instructions. "
                    "Pipeline halted."
                ) from exc
            else:
                logger.info("OT_API_KEY found. Falling back to OpenTopography API...")
                _download_opentopo_copernicus(dest)
                downloaded.append(dest)

    for lat, lon in tiles:
        lat_prefix = "N" if lat >= 0 else "S"
        lon_prefix = "E" if lon >= 0 else "W"
        key = _cop_dem_s3_key(lat, lon)
        append_data_source_record({
            "dataset": f"Copernicus DEM GLO-30 tile {lat_prefix}{abs(lat):02d}_{lon_prefix}{abs(lon):03d}",
            "source": "European Space Agency / AWS Open Data",
            "download_url": f"{COP_DEM_BUCKET}/{key}",
            "license": "CC-BY 4.0",
            "date_downloaded": today_iso(),
            "source_date": "2021",
            "resolution": "30m (~1 arc-second)",
            "coverage": f"1°×1° tile: {lat_prefix}{abs(lat):02d} {lon_prefix}{abs(lon):03d}",
            "notes": "Retrieved from public S3 bucket with --no-sign-request",
        })

    logger.info("STEP 2 complete: %d DEM tiles downloaded", len(downloaded))
    return downloaded


def step3_esa_worldcover() -> list[Path]:
    """Download ESA WorldCover 2021 v200 tiles covering the AOI.

    Uses aws s3 sync with --no-sign-request. Filters to tiles intersecting AOI.
    """
    logger.info("=" * 60)
    logger.info("STEP 3: ESA WorldCover 2021 v200 (AWS S3, no auth)")

    dest_dir = RAW / "worldcover"
    dest_dir.mkdir(parents=True, exist_ok=True)

    # List all available tiles
    prefix_uri = f"{WORLDCOVER_BUCKET}/{WORLDCOVER_PREFIX}/"
    logger.info("Listing WorldCover tiles from %s ...", prefix_uri)

    try:
        available = list_s3_prefix(prefix_uri, region=WORLDCOVER_REGION)
    except DataAcquisitionError:
        # Try without trailing slash
        prefix_uri = f"{WORLDCOVER_BUCKET}/{WORLDCOVER_PREFIX}"
        available = list_s3_prefix(prefix_uri + "/", region=WORLDCOVER_REGION)

    # Filter to tiles that intersect the AOI
    # WorldCover tiles are named e.g. ESA_WorldCover_10m_2021_v200_N18E075_Map.tif
    aoi_tiles = _worldcover_tiles_for_aoi(AOI_WEST, AOI_SOUTH, AOI_EAST, AOI_NORTH)
    logger.info("AOI WorldCover tile codes needed: %s", aoi_tiles)

    downloaded = []
    for tile_code in aoi_tiles:
        # Find this tile in the available list
        matching = [k for k in available if tile_code in k and k.endswith(".tif")]
        if not matching:
            raise DataAcquisitionError(
                f"WorldCover tile {tile_code} not found in S3 bucket listing. "
                f"Available tiles: {[k for k in available if '.tif' in k][:10]}..."
            )

        for key in matching:
            s3_uri = f"{WORLDCOVER_BUCKET}/{WORLDCOVER_PREFIX}/{key}"
            dest = dest_dir / Path(key).name
            download_s3_no_auth(s3_uri, dest, region=WORLDCOVER_REGION)
            downloaded.append(dest)

    append_data_source_record({
        "dataset": "ESA WorldCover 2021 v200",
        "source": "European Space Agency / AWS Open Data",
        "download_url": f"s3://esa-worldcover/v200/2021/map/",
        "license": "CC-BY 4.0",
        "date_downloaded": today_iso(),
        "source_date": "2021",
        "resolution": "10m",
        "coverage": f"Tiles: {', '.join(aoi_tiles)}",
        "notes": "10m land cover classification; 11 classes. Nearest-neighbour resampled to 50m for analysis.",
    })

    logger.info("STEP 3 complete: %d WorldCover tiles downloaded", len(downloaded))
    return downloaded


def _worldcover_tiles_for_aoi(
    west: float, south: float, east: float, north: float
) -> list[str]:
    """Compute WorldCover tile codes (3°×3°) intersecting the AOI."""
    # WorldCover tiles are 3°×3°, lower-left corner at multiples of 3°
    lat_min = math.floor(south / 3) * 3
    lat_max = math.floor(north / 3) * 3
    lon_min = math.floor(west / 3) * 3
    lon_max = math.floor(east / 3) * 3

    codes = []
    for lat in range(lat_min, lat_max + 1, 3):
        for lon in range(lon_min, lon_max + 1, 3):
            lat_prefix = "N" if lat >= 0 else "S"
            lon_prefix = "E" if lon >= 0 else "W"
            code = f"{lat_prefix}{abs(lat):02d}{lon_prefix}{abs(lon):03d}"
            codes.append(code)
    return codes


def step4_hydrorivers() -> Path:
    """Download HydroRIVERS Asia shapefile (confirmed URL from live page)."""
    logger.info("=" * 60)
    logger.info("STEP 4: HydroRIVERS Asia (HydroSHEDS)")

    dest_zip = RAW / "hydrorivers" / "HydroRIVERS_v10_as_shp.zip"
    dest_dir = RAW / "hydrorivers"

    download_http(HYDRORIVERS_ASIA_URL, dest_zip)
    _extract_zip(dest_zip, dest_dir)

    append_data_source_record({
        "dataset": "HydroRIVERS v1.0 Asia",
        "source": "HydroSHEDS / World Wildlife Fund",
        "download_url": HYDRORIVERS_ASIA_URL,
        "license": "CC-BY 4.0 (attribution required)",
        "date_downloaded": today_iso(),
        "source_date": "2013 (v1.0)",
        "resolution": "vector (15 arc-second derived)",
        "coverage": "Asia continent",
        "notes": "URL confirmed from live page hydrosheds.org/products/hydrorivers on 2026-08-29",
    })

    logger.info("STEP 4 complete: %s", dest_dir)
    return dest_dir / "HydroRIVERS_v10_as.shp"

def step4b_hydrobasins():
    logger.info("============================================================")
    logger.info("STEP 4B: HydroBASINS Asia Level 12 (HTTP, zip extraction)")

    url = "https://data.hydrosheds.org/file/HydroBASINS/standardized/hybas_as_lev12_v1c.zip"
    dest_dir = RAW / "hydrobasins"
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    zip_path = dest_dir / "hybas_as_lev12_v1c.zip"

    download_http(url, zip_path)
    _extract_zip(zip_path, dest_dir)

    append_data_source_record({
        "dataset": "HydroBASINS Asia (Level 12)",
        "source": "HydroSHEDS",
        "download_url": url,
        "license": "CC-BY 4.0",
        "date_downloaded": today_iso(),
        "source_date": "v1c",
        "resolution": "Vector",
        "coverage": "Asia",
        "notes": "Downloaded via HTTP",
    })
    logger.info("STEP 4B complete: %s", dest_dir)


def step5_jrc_gsw() -> list[Path]:
    """Download JRC Global Surface Water v1.5 occurrence tile(s) for AOI.

    URL format confirmed from live page (global-surface-water.appspot.com/download).
    Tiles are 10°×10°; top-left convention for naming.
    """
    logger.info("=" * 60)
    logger.info("STEP 5: JRC Global Surface Water v1.5 (direct download)")

    dest_dir = RAW / "jrc_gsw"
    dest_dir.mkdir(parents=True, exist_ok=True)

    urls = _jrc_gsw_tile_url(AOI_WEST, AOI_SOUTH, AOI_EAST, AOI_NORTH)
    logger.info("JRC GSW tile URLs for AOI: %s", urls)

    downloaded = []
    for url in urls:
        filename = url.split("/")[-1]
        dest = dest_dir / filename
        download_http(url, dest)
        downloaded.append(dest)

    append_data_source_record({
        "dataset": "JRC Global Surface Water v1.5 Occurrence (1984–2024)",
        "source": "EC JRC / Google",
        "download_url": urls[0] if len(urls) == 1 else str(urls),
        "license": "Copernicus Regulation (free, no restriction of use)",
        "date_downloaded": today_iso(),
        "source_date": "2024 (1984–2024 composite)",
        "resolution": "30m",
        "coverage": f"10°×10° tiles covering AOI",
        "notes": (
            "URL pattern confirmed from live page source code on 2026-08-29. "
            "Occurrence layer: % of time water is present (0–100). "
            "Cells with occurrence ≥ 50% treated as permanent water (np.inf hard constraint)."
        ),
    })

    logger.info("STEP 5 complete: %d JRC GSW tile(s) downloaded", len(downloaded))
    return downloaded


def step6_worldpop() -> Path:
    """Download WorldPop India 2020 100m unconstrained population raster.

    URL verified by browser navigation on 2026-08-29.
    File is 1.72 GB; script uses resumable HTTP download.
    """
    logger.info("=" * 60)
    logger.info("STEP 6: WorldPop India 2020 100m (direct download, ~1.72 GB)")

    dest = RAW / "worldpop" / "ind_ppp_2020.tif"

    download_http(WORLDPOP_INDIA_URL, dest)

    append_data_source_record({
        "dataset": "WorldPop India 2020 Unconstrained Population (100m)",
        "source": "WorldPop / University of Southampton",
        "download_url": WORLDPOP_INDIA_URL,
        "license": "CC-BY 4.0",
        "date_downloaded": today_iso(),
        "source_date": "2020",
        "resolution": "100m",
        "coverage": "India (national)",
        "notes": (
            "Unconstrained 100m population count estimate. "
            "URL verified by browser navigation 2026-08-29. "
            "Clipped to AOI and bilinearly resampled to 50m during preprocessing. "
            "DISCLAIMER: population figures are ESTIMATES, not census counts."
        ),
    })

    logger.info("STEP 6 complete: %s", dest)
    return dest


def step7_wdpa_login_required() -> None:
    """WDPA Protected Areas — LOGIN REQUIRED.

    This function halts the pipeline and prompts the user to:
    1. Navigate to https://www.protectedplanet.net
    2. Create a free account
    3. Request a free API token
    4. Set WDPA_API_TOKEN environment variable
    5. Re-run this script

    Per project protocol: do NOT attempt to scrape around the login.
    """
    logger.info("=" * 60)
    logger.info("STEP 7: WDPA Protected Areas — LOGIN REQUIRED")
    logger.info("")
    logger.info("ACTION REQUIRED:")
    logger.info("  Please open your browser and navigate to:")
    logger.info("    https://www.protectedplanet.net")
    logger.info("")
    logger.info("  1. Register a free account (if you don't have one).")
    logger.info("  2. Go to your profile / API section and generate a free API token.")
    logger.info("  3. Once you have the token, set it as an environment variable:")
    logger.info("       Windows (PowerShell):  $env:WDPA_API_TOKEN = '<your-token>'")
    logger.info("       Linux/macOS:           export WDPA_API_TOKEN=<your-token>")
    logger.info("  4. Re-run this script: python scripts/download_data.py")
    logger.info("")
    logger.info("If the token process stalls, you may run with --skip-wdpa to note WDPA")
    logger.info("as unavailable in metadata and proceed with the fallback (WorldCover proxy).")
    logger.info("=" * 60)

    wdpa_token = os.environ.get("WDPA_API_TOKEN", "").strip()
    if not wdpa_token:
        raise DataAcquisitionError(
            "WDPA_API_TOKEN environment variable is not set. "
            "See instructions above. "
            "Use --skip-wdpa to bypass with noted metadata gap."
        )

    _download_wdpa_with_token(wdpa_token)


def _download_wdpa_with_token(token: str) -> Path:
    """Download WDPA shapefiles via protectedplanet.net API using a user-provided token."""
    import time

    logger.info("WDPA token found. Requesting WDPA data for India (ISO3: IND)...")

    # WDPA API: request a download for a country
    # Endpoint documented at https://api.protectedplanet.net/
    base_api = "https://api.protectedplanet.net/v3"
    dest_dir = RAW / "wdpa"
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: Request a download for India
    req_url = f"{base_api}/countries/IND?token={token}&with_geometry=true"

    import requests as req_mod
    resp = req_mod.get(req_url, timeout=60)
    if resp.status_code != 200:
        raise DataAcquisitionError(
            f"WDPA API returned HTTP {resp.status_code} for {req_url}\n"
            f"Response: {resp.text[:500]}"
        )

    data = resp.json()

    # WDPA API v3 returns a download URL inside the response
    # Structure may vary — extract the download URL
    download_url = None
    if "country" in data and "file_url" in data["country"]:
        download_url = data["country"]["file_url"]
    elif "file_url" in data:
        download_url = data["file_url"]

    if not download_url:
        # Some API versions trigger an asynchronous job first
        # Try the /downloads endpoint
        dl_url = f"{base_api}/downloads?token={token}&country=IND"
        resp2 = req_mod.post(dl_url, timeout=60)
        if resp2.status_code in (200, 201, 202):
            dl_data = resp2.json()
            logger.info("WDPA download triggered. Response: %s", str(dl_data)[:200])
            # Poll for ready URL if async
            if "location" in resp2.headers:
                poll_url = resp2.headers["location"]
                for _ in range(20):
                    pr = req_mod.get(poll_url, timeout=60)
                    if pr.status_code == 200:
                        pd = pr.json()
                        if isinstance(pd, dict) and pd.get("url"):
                            download_url = pd["url"]
                            break
                    logger.info("Waiting for WDPA download to be ready...")
                    time.sleep(30)

    if not download_url:
        raise DataAcquisitionError(
            "Could not obtain WDPA download URL from API. "
            "The API response format may have changed. "
            "Please download WDPA India manually from "
            "https://www.protectedplanet.net and place the shapefile in "
            "data/raw/wdpa/ then re-run with --wdpa-local."
        )

    dest_zip = dest_dir / "WDPA_India.zip"
    download_http(download_url, dest_zip)
    _extract_zip(dest_zip, dest_dir)

    append_data_source_record({
        "dataset": "WDPA Protected Areas India",
        "source": "IUCN / UNEP-WCMC / Protected Planet",
        "download_url": download_url,
        "license": "Protected Planet Data License (free for non-commercial use)",
        "date_downloaded": today_iso(),
        "source_date": today_iso()[:7],  # month of download
        "resolution": "vector",
        "coverage": "India (ISO3: IND)",
        "notes": "Downloaded via Protected Planet API v3 with user-provided token.",
    })

    logger.info("STEP 7 complete: WDPA data downloaded to %s", dest_dir)

    # Find the main shapefile
    shapefiles = list(dest_dir.rglob("*.shp"))
    if not shapefiles:
        raise DataAcquisitionError(
            f"No .shp file found in {dest_dir} after extracting WDPA zip. "
            "Check the downloaded archive."
        )
    return shapefiles[0]


def step7_wdpa_skip() -> None:
    """Record WDPA as unavailable in metadata and continue."""
    logger.warning("WDPA skipped. Protected-area hard constraints will be DISABLED.")
    logger.warning("The acquisition_friction_index protected-area component will be 0.0.")
    append_data_source_record({
        "dataset": "WDPA Protected Areas",
        "source": "IUCN / UNEP-WCMC / Protected Planet",
        "download_url": "https://www.protectedplanet.net",
        "license": "Protected Planet Data License",
        "date_downloaded": today_iso(),
        "source_date": "N/A",
        "resolution": "N/A",
        "coverage": "N/A",
        "notes": (
            "WDPA NOT DOWNLOADED — API token not provided. "
            "Protected-area hard constraints are DISABLED for this run. "
            "The acquisition_friction_index protected-area proximity component is set to 0.0. "
            "Results do NOT account for legally protected areas."
        ),
    })


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Download all mandatory datasets for the Infrastructure Intelligence Platform demo AOI."
    )
    parser.add_argument(
        "--skip-wdpa",
        action="store_true",
        help="Skip WDPA download (records unavailability in metadata). "
             "Protected-area hard constraints will be disabled.",
    )
    parser.add_argument(
        "--wdpa-local",
        type=str,
        default=None,
        metavar="PATH",
        help="Use a locally downloaded WDPA shapefile instead of API download.",
    )
    parser.add_argument(
        "--steps",
        type=str,
        default="1,2,3,4,4b,5,6,7",
        help="Comma-separated list of steps to run (default: all). e.g. --steps 1,2,3",
    )
    args = parser.parse_args()

    steps_to_run = set(args.steps.split(","))

    logger.info("Infrastructure Intelligence Platform — Data Download")
    logger.info("Demo AOI: [%.1f, %.1f, %.1f, %.1f]", AOI_WEST, AOI_SOUTH, AOI_EAST, AOI_NORTH)
    logger.info("Steps to run: %s", sorted(steps_to_run))

    try:
        if "1" in steps_to_run:
            step1_osm_maharashtra()

        if "2" in steps_to_run:
            step2_copernicus_dem()

        if "3" in steps_to_run:
            step3_esa_worldcover()

        if "4" in steps_to_run:
            step4_hydrorivers()
        
        if "4b" in steps_to_run:
            step4b_hydrobasins()

        if "5" in steps_to_run:
            step5_jrc_gsw()

        if "6" in steps_to_run:
            step6_worldpop()

        if "7" in steps_to_run:
            if args.skip_wdpa:
                step7_wdpa_skip()
            elif args.wdpa_local:
                # User provided a local file — record it
                wdpa_path = Path(args.wdpa_local)
                if not wdpa_path.exists():
                    raise DataAcquisitionError(f"--wdpa-local path does not exist: {wdpa_path}")
                append_data_source_record({
                    "dataset": "WDPA Protected Areas India (local)",
                    "source": "IUCN / UNEP-WCMC / Protected Planet",
                    "download_url": "https://www.protectedplanet.net (manual download)",
                    "license": "Protected Planet Data License",
                    "date_downloaded": today_iso(),
                    "source_date": today_iso()[:7],
                    "resolution": "vector",
                    "coverage": "India",
                    "notes": f"Provided by user at: {wdpa_path}",
                })
                logger.info("WDPA local file recorded: %s", wdpa_path)
            else:
                step7_wdpa_login_required()

        logger.info("=" * 60)
        logger.info("All requested downloads complete.")
        logger.info("Provenance records written to: %s", METADATA / "data_sources.yaml")
        logger.info("")
        logger.info("Next step: python scripts/preprocess_data.py")

    except DataAcquisitionError as exc:
        logger.error("=" * 60)
        logger.error("DOWNLOAD FAILED — PIPELINE HALTED")
        logger.error("%s", exc)
        logger.error("=" * 60)
        logger.error("Per project hard constraints: do not substitute fake/sample data.")
        logger.error("Resolve the failure above and re-run.")
        sys.exit(1)


if __name__ == "__main__":
    main()
