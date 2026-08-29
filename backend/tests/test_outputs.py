import json
import geopandas as gpd
import rasterio
from pathlib import Path
import pytest
import numpy as np

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "outputs"

def test_routes_generated():
    routes_file = OUTPUT_DIR / "routes.geojson"
    assert routes_file.exists()
    gdf = gpd.read_file(routes_file)
    assert len(gdf) == 5, "Expected 5 routes"
    assert "mcda_score" in gdf.columns
    assert "route_length_km" in gdf.columns
    assert gdf.crs.to_string() == "EPSG:4326"

def test_sites_generated():
    sites_file = OUTPUT_DIR / "sites.geojson"
    assert sites_file.exists()
    gdf = gpd.read_file(sites_file)
    assert len(gdf) >= 1, "Expected at least 1 valid site"
    assert "candidate_area_ha" in gdf.columns
    
    # 50 acres is approx 20.23 ha
    for area in gdf["candidate_area_ha"]:
        assert area >= 20.23, "Site is smaller than 50 acres minimum"
        
def test_cost_surface_validity():
    cost_file = OUTPUT_DIR / "route_cost_surface.tif"
    assert cost_file.exists()
    with rasterio.open(cost_file) as src:
        assert src.crs.to_string() == "EPSG:32643"
        data = src.read(1)
        # Ensure there are unreachable inf areas
        assert np.isinf(data).any(), "Cost surface lacks hard constraints (inf)"
