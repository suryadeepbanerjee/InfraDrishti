import os
import shutil
import json
import logging
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel
import geopandas as gpd
from shapely.geometry import box, LineString, Polygon
import pyproj
import numpy as np
import uuid

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
RUNTIME_DIR = BASE_DIR / "runtime"
OUTPUT_DIR = BASE_DIR / "outputs"

class WorkspaceLimitError(Exception):
    pass

class WorkspaceManager:
    def __init__(self, request_id=None):
        self.request_id = request_id or datetime.now().strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:8]
        self.ws_dir = RUNTIME_DIR / self.request_id
        self.raw_dir = self.ws_dir / "raw"
        self.interim_dir = self.ws_dir / "interim"
        self.processed_dir = self.ws_dir / "processed"
        self.out_dir = OUTPUT_DIR / self.request_id
        self.manifest_file = self.ws_dir / "manifest.json"
        
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._create_dirs()
        self.manifest = {
            "request_id": self.request_id,
            "status": "INITIALIZED",
            "datasets": [],
            "timestamp": datetime.now().isoformat()
        }
        self.save_manifest()
        
    def _create_dirs(self):
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.interim_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        (self.processed_dir / "cost_components").mkdir(parents=True, exist_ok=True)

    def save_manifest(self):
        with open(self.manifest_file, "w") as f:
            json.dump(self.manifest, f, indent=2)
            
    def copy_manifest_to_output(self):
        shutil.copy(self.manifest_file, self.out_dir / "processing_summary.json")

    def cleanup(self):
        try:
            shutil.rmtree(self.raw_dir, ignore_errors=True)
            shutil.rmtree(self.interim_dir, ignore_errors=True)
            self.manifest["cleanup_status"] = "deleted_raw_interim"
            self.save_manifest()
            self.copy_manifest_to_output()
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")

    def calculate_corridor_aoi(self, lon1, lat1, lon2, lat2, width_m, buffer_margin_m=50000):
        # Use EPSG:7755 - India NSF LCC (Lambert Conic Conformal 2SP)
        wgs84 = pyproj.CRS("EPSG:4326")
        india_lcc = pyproj.CRS("EPSG:7755")
        
        transformer = pyproj.Transformer.from_crs(wgs84, india_lcc, always_xy=True)
        x1, y1 = transformer.transform(lon1, lat1)
        x2, y2 = transformer.transform(lon2, lat2)
        
        line = LineString([(x1, y1), (x2, y2)])
        length_m = line.length
        
        total_buffer = buffer_margin_m + (width_m / 2.0)
        poly_lcc = line.buffer(total_buffer)
        
        minx, miny, maxx, maxy = poly_lcc.bounds
        bbox_width = maxx - minx
        bbox_height = maxy - miny
        
        actual_corridor_area_sqkm = poly_lcc.area / 1000000.0
        bbox_area_sqkm = (bbox_width * bbox_height) / 1000000.0
        
        cols = int(bbox_width / 50.0)
        rows = int(bbox_height / 50.0)
        cells = cols * rows
        est_ram_gb = (cells * 4 * 15) / (1024**3)
        
        logger.info(f"Length: {length_m/1000:.1f} km. Actual Poly Area: {actual_corridor_area_sqkm:.1f} sqkm.")
        logger.info(f"BBox Area: {bbox_area_sqkm:.1f} sqkm. Cells: {cells}. Est RAM: {est_ram_gb:.1f} GB.")
        
        # Determine chunking requirement
        chunking_required = False
        chunks = []
        if est_ram_gb > 16.0:
            chunking_required = True
            logger.info("Monolithic grid exceeds 16GB. Calculating chunk segments.")
            # Simple chunk generation along the line
            num_chunks = int(np.ceil(est_ram_gb / 10.0))  # Aim for ~10GB per chunk max
            chunk_length = length_m / num_chunks
            
            for i in range(num_chunks):
                p1 = line.interpolate(i * chunk_length)
                p2 = line.interpolate(min((i+1) * chunk_length + (buffer_margin_m), length_m))
                chunk_line = LineString([p1, p2])
                c_poly = chunk_line.buffer(total_buffer)
                chunks.append(c_poly.bounds)
        else:
            chunks.append((minx, miny, maxx, maxy))
            
        # Overall WGS bounds
        transformer_back = pyproj.Transformer.from_crs(india_lcc, wgs84, always_xy=True)
        corners = [(minx, miny), (minx, maxy), (maxx, miny), (maxx, maxy)]
        lons, lats = zip(*[transformer_back.transform(cx, cy) for cx, cy in corners])
        wgs_bounds = (min(lons), min(lats), max(lons), max(lats))
        
        self.manifest['aoi'] = {
            'lcc_bounds': (minx, miny, maxx, maxy),
            'wgs84_bounds': wgs_bounds,
            'crs': "EPSG:7755",
            'cols': cols,
            'rows': rows,
            'poly_area_sqkm': actual_corridor_area_sqkm,
            'bbox_area_sqkm': bbox_area_sqkm,
            'chunking_required': chunking_required,
            'num_chunks': len(chunks)
        }
        self.save_manifest()
        
        return poly_lcc, wgs_bounds, "EPSG:7755"

    def calculate_site_aoi(self, lon, lat, radius_m=50000):
        wgs84 = pyproj.CRS("EPSG:4326")
        india_lcc = pyproj.CRS("EPSG:7755")
        transformer = pyproj.Transformer.from_crs(wgs84, india_lcc, always_xy=True)
        
        cx, cy = transformer.transform(lon, lat)
        poly_lcc = box(cx - radius_m, cy - radius_m, cx + radius_m, cy + radius_m)
        
        minx, miny, maxx, maxy = poly_lcc.bounds
        area_sqkm = ((maxx - minx) * (maxy - miny)) / 1000000.0
        
        cols = int((maxx - minx) / 50.0)
        rows = int((maxy - miny) / 50.0)
        
        transformer_back = pyproj.Transformer.from_crs(india_lcc, wgs84, always_xy=True)
        corners = [(minx, miny), (minx, maxy), (maxx, miny), (maxx, maxy)]
        lons, lats = zip(*[transformer_back.transform(x, y) for x, y in corners])
        wgs_bounds = (min(lons), min(lats), max(lons), max(lats))
        
        self.manifest['aoi'] = {
            'lcc_bounds': (minx, miny, maxx, maxy),
            'wgs84_bounds': wgs_bounds,
            'crs': "EPSG:7755",
            'cols': cols,
            'rows': rows,
            'area_sqkm': area_sqkm
        }
        self.save_manifest()
        
        return poly_lcc, wgs_bounds, "EPSG:7755"

