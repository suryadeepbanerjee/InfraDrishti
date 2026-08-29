import os
import glob
import logging
from pathlib import Path
import math
import shutil
import subprocess
import urllib.request
import re
import zipfile
import rasterio
import fiona
import geopandas as gpd
from shapely.geometry import Polygon, box

from .base import BaseProvider

logger = logging.getLogger(__name__)

class DataCoverageError(Exception):
    pass

def download_file(url, local_path):
    logger.info(f"Downloading {url} to {local_path}")
    req = urllib.request.Request(url, headers={'User-Agent': 'AntigravityIDE/1.0'})
    with urllib.request.urlopen(req) as response, open(local_path, 'wb') as out_file:
        shutil.copyfileobj(response, out_file)

def parse_poly_file(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'AntigravityIDE/1.0'})
    try:
        with urllib.request.urlopen(req) as response:
            lines = response.read().decode().splitlines()
            coords = []
            for line in lines:
                line = line.strip()
                if not line or line == "END" or line.startswith("polygon"):
                    continue
                try:
                    lon, lat = map(float, line.split())
                    coords.append((lon, lat))
                except ValueError:
                    pass
            if coords:
                return Polygon(coords)
    except Exception as e:
        pass
    return None

class OSMProvider(BaseProvider):
    def discover(self):
        minx, miny, maxx, maxy = self.workspace.manifest['aoi']['wgs84_bounds']
        aoi_poly = box(minx, miny, maxx, maxy)
        
        # 1. Discover sub-regions dynamically from HTML
        zones = []
        try:
            req = urllib.request.Request("https://download.geofabrik.de/asia/india.html", headers={'User-Agent': 'AntigravityIDE/1.0'})
            with urllib.request.urlopen(req) as response:
                html = response.read().decode()
                # find hrefs like "india/central-zone-latest.osm.pbf"
                links = re.findall(r'href="(india/[^"]+-latest\.osm\.pbf)"', html)
                for link in links:
                    # extract 'central-zone'
                    zone_name = link.split('/')[1].replace('-latest.osm.pbf', '')
                    zones.append(zone_name)
        except Exception as e:
            logger.warning(f"Failed to scrape geofabrik HTML: {e}")
            
        best_zone = None
        best_area = float('inf')
        
        logger.info(f"Discovered {len(zones)} official India regional extracts dynamically from HTML.")
        
        for zone in zones:
            poly_url = f"https://download.geofabrik.de/asia/india/{zone}.poly"
            region_poly = parse_poly_file(poly_url)
            if region_poly and region_poly.contains(aoi_poly):
                area = region_poly.area
                if area < best_area:
                    best_area = area
                    best_zone = zone
                    
        if best_zone:
            logger.info(f"Geofabrik Selection: Fully covering sub-region '{best_zone}'")
            self.target_url = f"https://download.geofabrik.de/asia/india/{best_zone}-latest.osm.pbf"
            self.filename = f"{best_zone}-latest.osm.pbf"
        else:
            logger.info("Geofabrik Selection: No sub-region fully covers AOI. Falling back to full India.")
            self.target_url = "https://download.geofabrik.de/asia/india-latest.osm.pbf"
            self.filename = "india-latest.osm.pbf"
        
    def download(self):
        local_path = Path("data/raw") / self.filename
        if local_path.exists():
            self.downloaded_path = local_path
            self.temporary = False
        else:
            self.downloaded_path = self.workspace.raw_dir / self.filename
            download_file(self.target_url, self.downloaded_path)
            self.temporary = True
            
    def validate(self):
        try:
            layers = fiona.listlayers(str(self.downloaded_path))
            if not layers:
                raise Exception("No layers found")
        except Exception as e:
            raise DataCoverageError(f"OSM validation failed: {e}")
            
    def get_paths(self):
        self._add_manifest_entry("OSM", self.target_url, [self.downloaded_path], self.temporary)
        return [self.downloaded_path]


# The rest of the providers remain the same (real downloads, validation, etc.)
class CopernicusDEMProvider(BaseProvider):
    def discover(self):
        minx, miny, maxx, maxy = self.workspace.manifest['aoi']['wgs84_bounds']
        self.tiles = []
        for x in range(math.floor(minx), math.ceil(maxx)):
            for y in range(math.floor(miny), math.ceil(maxy)):
                ns = "N" if y >= 0 else "S"
                ew = "E" if x >= 0 else "W"
                name = f"Copernicus_DSM_COG_10_{ns}{abs(y):02d}_00_{ew}{abs(x):03d}_00_DEM"
                self.tiles.append(name)
        self.base_url = "https://copernicus-dem-30m.s3.amazonaws.com/"
        
    def download(self):
        self.downloaded_paths = []
        self.temporary = False
        for tile in self.tiles:
            tif_name = f"{tile}.tif"
            local_path = Path("data/raw/copernicus_dem") / tif_name
            if local_path.exists():
                self.downloaded_paths.append(local_path)
            else:
                dl_path = self.workspace.raw_dir / tif_name
                url = f"{self.base_url}{tile}/{tif_name}"
                logger.info(f"Downloading from HTTPS: {url}")
                download_file(url, dl_path)
                self.downloaded_paths.append(dl_path)
                self.temporary = True
                
    def validate(self):
        for path in self.downloaded_paths:
            with rasterio.open(path) as src:
                if src.count < 1:
                    raise DataCoverageError(f"DEM validation failed for {path}")
                    
    def get_paths(self):
        self._add_manifest_entry("Copernicus_DEM", self.base_url, self.downloaded_paths, self.temporary)
        return self.downloaded_paths

class WorldCoverProvider(BaseProvider):
    def discover(self):
        minx, miny, maxx, maxy = self.workspace.manifest['aoi']['wgs84_bounds']
        self.tiles = []
        for x in range(math.floor(minx/3)*3, math.ceil(maxx/3)*3, 3):
            for y in range(math.floor(miny/3)*3, math.ceil(maxy/3)*3, 3):
                ns = "N" if y >= 0 else "S"
                ew = "E" if x >= 0 else "W"
                tilename = f"ESA_WorldCover_10m_2021_v200_{ns}{abs(y):02d}{ew}{abs(x):03d}_Map.tif"
                self.tiles.append(tilename)
        self.base_url = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
        
    def download(self):
        self.downloaded_paths = []
        self.temporary = False
        for tile in self.tiles:
            local_path = Path("data/raw/worldcover") / tile
            if local_path.exists():
                self.downloaded_paths.append(local_path)
            else:
                dl_path = self.workspace.raw_dir / tile
                url = self.base_url + tile
                download_file(url, dl_path)
                self.downloaded_paths.append(dl_path)
                self.temporary = True
                
    def validate(self):
        for path in self.downloaded_paths:
            with rasterio.open(path) as src:
                if src.count < 1:
                    raise DataCoverageError(f"WorldCover validation failed for {path}")
                    
    def get_paths(self):
        self._add_manifest_entry("ESA_WorldCover", self.base_url, self.downloaded_paths, self.temporary)
        return self.downloaded_paths

class WorldPopProvider(BaseProvider):
    def discover(self):
        self.filename = "ind_ppp_2020.tif"
        self.url = "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/IND/ind_ppp_2020.tif"
        
    def download(self):
        local_path = Path("data/raw/worldpop") / self.filename
        if local_path.exists():
            self.downloaded_path = local_path
            self.temporary = False
        else:
            self.downloaded_path = self.workspace.raw_dir / self.filename
            download_file(self.url, self.downloaded_path)
            self.temporary = True
            
    def validate(self):
        with rasterio.open(self.downloaded_path) as src:
             if src.count < 1:
                 raise DataCoverageError("WorldPop validation failed")
                 
    def get_paths(self):
        self._add_manifest_entry("WorldPop", self.url, [self.downloaded_path], self.temporary)
        return [self.downloaded_path]

class HydroRIVERSProvider(BaseProvider):
    def discover(self):
        self.url = "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip"
        self.filename = "HydroRIVERS_v10_as_shp.zip"
        
    def download(self):
        local_dir = Path("data/raw/hydrorivers")
        local_zip = local_dir / self.filename
        self.downloaded_path = None
        
        if not local_zip.exists():
            local_dir.mkdir(parents=True, exist_ok=True)
            dl_path = self.workspace.raw_dir / self.filename
            download_file(self.url, dl_path)
            shutil.copy(dl_path, local_zip)
            self.temporary = True
        else:
            self.temporary = False
            
        with zipfile.ZipFile(local_zip, 'r') as z:
            z.extractall(local_dir)
            
        shp_files = list(local_dir.glob("**/*.shp"))
        if shp_files:
            self.downloaded_path = shp_files[0]
            
    def validate(self):
        try:
            if not self.downloaded_path:
                raise Exception("No .shp file found in HydroRIVERS archive")
            layers = fiona.listlayers(str(self.downloaded_path))
            if not layers:
                raise Exception("No layers found")
        except Exception as e:
            raise DataCoverageError(f"HydroRIVERS validation failed: {e}")
            
    def get_paths(self):
        self._add_manifest_entry("HydroRIVERS", self.url, [self.downloaded_path], self.temporary)
        return [self.downloaded_path]

class HydroBASINSProvider(BaseProvider):
    def discover(self):
        self.url = "https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_as_lev12_v1c.zip"
        self.filename = "hybas_as_lev12_v1c.zip"
        
    def download(self):
        local_dir = Path("data/raw/hydrobasins")
        local_zip = local_dir / self.filename
        self.downloaded_path = None
        
        if not local_zip.exists():
            local_dir.mkdir(parents=True, exist_ok=True)
            dl_path = self.workspace.raw_dir / self.filename
            download_file(self.url, dl_path)
            shutil.copy(dl_path, local_zip)
            self.temporary = True
        else:
            self.temporary = False
            
        with zipfile.ZipFile(local_zip, 'r') as z:
            z.extractall(local_dir)
            
        shp_files = list(local_dir.glob("**/*.shp"))
        if shp_files:
            self.downloaded_path = shp_files[0]
            
    def validate(self):
        try:
            if not self.downloaded_path:
                raise Exception("No .shp file found in HydroBASINS archive")
            layers = fiona.listlayers(str(self.downloaded_path))
            if not layers:
                raise Exception("No layers found")
        except Exception as e:
            raise DataCoverageError(f"HydroBASINS validation failed: {e}")
            
    def get_paths(self):
        self._add_manifest_entry("HydroBASINS", self.url, [self.downloaded_path], self.temporary)
        return [self.downloaded_path]

class WDPAProvider(BaseProvider):
    def discover(self):
        self.url = "https://www.protectedplanet.net/en/thematic-areas/wdpa"
        self.archive_dir = Path("data/raw/wdpa")
        
    def download(self):
        self.temporary = False
        self.zips = list(self.archive_dir.glob("**/*.zip"))
        
    def validate(self):
        if not self.zips:
            raise DataCoverageError("No WDPA archives found in data/raw/wdpa")
            
    def get_paths(self):
        self._add_manifest_entry("WDPA", self.url, self.zips, self.temporary)
        return self.zips

class JRCProvider(BaseProvider):
    def discover(self):
        minx, miny, maxx, maxy = self.workspace.manifest['aoi']['wgs84_bounds']
        self.tiles = []
        for x in range(math.floor(minx/10)*10, math.ceil(maxx/10)*10, 10):
            for y in range(math.floor(miny/10)*10, math.ceil(maxy/10)*10, 10):
                ns = "N" if y >= 0 else "S"
                ew = "E" if x >= 0 else "W"
                tilename = f"occurrence_{abs(x)}{ew}_{abs(y)}{ns}_v1_5_2024.tif"
                self.tiles.append(tilename)
        self.base_url = "https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/"
        
    def download(self):
        self.downloaded_paths = []
        self.temporary = False
        for tile in self.tiles:
            local_path = Path("data/raw/jrc_gsw") / tile
            if local_path.exists():
                self.downloaded_paths.append(local_path)
            else:
                dl_path = self.workspace.raw_dir / tile
                download_file(self.base_url + tile, dl_path)
                self.downloaded_paths.append(dl_path)
                self.temporary = True
                
    def validate(self):
        for path in self.downloaded_paths:
            with rasterio.open(path) as src:
                if src.count < 1:
                    raise DataCoverageError(f"JRC validation failed for {path}")
                    
    def get_paths(self):
        self._add_manifest_entry("JRC_GSW", self.base_url, self.downloaded_paths, self.temporary)
        return self.downloaded_paths



