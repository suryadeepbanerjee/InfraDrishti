import logging
from pathlib import Path
import geopandas as gpd
import pandas as pd
import rasterio
from rasterio.mask import mask
from rasterio.merge import merge
from rasterio.warp import reproject, Resampling, calculate_default_transform, transform_bounds
from rasterio.features import rasterize
import numpy as np
import fiona

logger = logging.getLogger(__name__)

class PreprocessingPipeline:
    def __init__(self, workspace):
        self.workspace = workspace
        self.target_crs = self.workspace.manifest['aoi']['crs'] # EPSG:7755
        self.wgs_bounds = self.workspace.manifest['aoi']['wgs84_bounds']
        
    def _create_master_profile(self):
        minx, miny, maxx, maxy = self.workspace.manifest['aoi']['lcc_bounds']
        cols = self.workspace.manifest['aoi']['cols']
        rows = self.workspace.manifest['aoi']['rows']
        
        transform = rasterio.transform.from_bounds(minx, miny, maxx, maxy, cols, rows)
        
        return {
            'driver': 'GTiff',
            'dtype': 'float32',
            'nodata': -9999.0,
            'width': cols,
            'height': rows,
            'count': 1,
            'crs': self.target_crs,
            'transform': transform,
            'compress': 'lzw'
        }
        
    def _process_raster(self, paths, output_name, resampling=Resampling.nearest):
        if not paths:
            return
            
        master_profile = self._create_master_profile()
        output_path = self.workspace.processed_dir / "cost_components" / output_name
        
        logger.info(f"Preprocessing raster: {output_name}")
        
        if len(paths) > 1:
            src_files_to_mosaic = []
            source_crs = None
            for fp in paths:
                src = rasterio.open(fp)
                if not source_crs:
                    source_crs = src.crs
                src_files_to_mosaic.append(src)
                
            # Properly transform WGS84 bounds into the source CRS for correct merging
            src_bounds = transform_bounds("EPSG:4326", source_crs, *self.wgs_bounds)
                
            mosaic, out_trans = merge(src_files_to_mosaic, bounds=src_bounds)
            out_meta = src.meta.copy()
            out_meta.update({"driver": "GTiff", "height": mosaic.shape[1],
                             "width": mosaic.shape[2], "transform": out_trans})
                             
            temp_mosaic = self.workspace.interim_dir / f"temp_mosaic_{output_name}"
            with rasterio.open(temp_mosaic, "w", **out_meta) as dest:
                dest.write(mosaic)
                
            for src in src_files_to_mosaic:
                src.close()
                
            source_path = temp_mosaic
        else:
            source_path = paths[0]
            
        # Reproject to EPSG:7755 master grid
        with rasterio.open(source_path) as src:
            with rasterio.open(output_path, 'w', **master_profile) as dst:
                reproject(
                    source=rasterio.band(src, 1),
                    destination=rasterio.band(dst, 1),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=master_profile['transform'],
                    dst_crs=master_profile['crs'],
                    resampling=resampling
                )

    def _process_vector(self, paths, output_name, value_col=None, default_val=1, layer=None):
        if not paths:
            return
            
        master_profile = self._create_master_profile()
        output_path = self.workspace.processed_dir / "cost_components" / output_name
        
        logger.info(f"Preprocessing vector: {output_name}")
        
        gdfs = []
        for path in paths:
            # Use fiona to read bounding box intersected geometries
            try:
                # Need to use 'zip://' if it's an archive 
                p_str = str(path)
                if p_str.endswith('.zip'):
                    p_str = f"zip://{p_str}"
                    
                gdf = gpd.read_file(p_str, bbox=self.wgs_bounds, layer=layer)
                if not gdf.empty:
                    gdfs.append(gdf)
            except Exception as e:
                logger.warning(f"Could not read {path} with bbox filter: {e}")
                
        if not gdfs:
            # Empty raster out
            with rasterio.open(output_path, 'w', **master_profile) as dst:
                dst.write(np.zeros((master_profile['height'], master_profile['width']), dtype='float32'), 1)
            return
            
        merged_gdf = gpd.GeoDataFrame(pd.concat(gdfs, ignore_index=True), crs=gdfs[0].crs)
        
        # Explicitly ensure geometry is valid
        merged_gdf = merged_gdf[merged_gdf.is_valid]
        merged_gdf = merged_gdf.to_crs(self.target_crs)
        
        shapes = []
        for _, row in merged_gdf.iterrows():
            geom = row.geometry
            val = row[value_col] if value_col and value_col in row else default_val
            shapes.append((geom, val))
            
        if shapes:
            rasterized = rasterize(
                shapes,
                out_shape=(master_profile['height'], master_profile['width']),
                transform=master_profile['transform'],
                fill=0,
                dtype='float32'
            )
        else:
            rasterized = np.zeros((master_profile['height'], master_profile['width']), dtype='float32')
            
        with rasterio.open(output_path, 'w', **master_profile) as dst:
            dst.write(rasterized, 1)

    def process_corridor(self, osm_paths, dem_paths, wc_paths, jrc_paths, wdpa_paths, pop_paths, rivers_paths=None, basins_paths=None):
        logger.info("Starting REAL processing of downloaded rasters...")
        self._process_raster(dem_paths, "dem.tif", Resampling.bilinear)
        self._process_raster(wc_paths, "worldcover.tif")
        self._process_raster(jrc_paths, "surface_water.tif")
        self._process_raster(pop_paths, "population.tif")
        
        logger.info("Starting REAL processing of downloaded vectors...")
        # WDPA - read from local zip, clip to WGS bounds, rasterize to EPSG:7755 mask
        # Usually WDPA is polygon, output to protected_areas.tif
        self._process_vector(wdpa_paths, "protected_areas.tif", default_val=1)
        
        # OSM - read roads/buildings, output to roads.tif / buildings.tif
        if osm_paths:
            # For PBFs, layers are 'lines' and 'multipolygons'
            self._process_vector(osm_paths, "highways.tif", layer='lines', default_val=1)
            self._process_vector(osm_paths, "buildings.tif", layer='multipolygons', default_val=1)
            
        # HydroRIVERS
        if rivers_paths:
            self._process_vector(rivers_paths, "rivers.tif", default_val=1)
            
        # HydroBASINS
        if basins_paths:
            self._process_vector(basins_paths, "basins.tif", default_val=1)
            
        logger.info("Real Preprocessing Pipeline Complete.")
