"""
Infrastructure Intelligence Platform — Acquisition Friction Index

Computes the acquisition_friction_index raster from spatial proxy layers.

MANDATORY NAMING AND FRAMING:
    The output of this module is always named "acquisition_friction_index".
    It is a spatial proxy/screening index. It is NOT:
      - an acquisition probability
      - an ownership probability
      - a parcel-level acquisition risk
      - a legal or financial claim

Formula:
    acquisition_friction_index = (
        0.35 * norm(building_density_kernel)  +
        0.25 * norm(population)               +
        0.25 * landuse_friction(landcover)    +
        0.15 * protected_area_proximity
    )

All components are normalised to [0, 1] before weighting.
Result is also in [0, 1]: 0 = lowest friction, 1 = highest friction.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import rasterio
from rasterio.transform import Affine

logger = logging.getLogger(__name__)

# Land-use friction scores per ESA WorldCover 2021 class code
# These reflect how difficult (in a planning context) it is to acquire/traverse land
# of each type. They are NOT parcel prices or legal acquisition assessments.
LANDUSE_FRICTION: dict[int, float] = {
    10: 0.50,   # Tree cover (forest)
    20: 0.20,   # Shrubland
    30: 0.10,   # Grassland
    40: 0.60,   # Cropland
    50: 1.00,   # Built-up
    60: 0.05,   # Bare/sparse vegetation
    70: 0.70,   # Snow and ice
    80: 0.90,   # Permanent water bodies
    90: 0.40,   # Herbaceous wetland
    95: 0.70,   # Mangroves
    100: 0.30,  # Moss and lichen
}
DEFAULT_LANDUSE_FRICTION = 0.30


def compute_acquisition_friction_index(
    building_density: np.ndarray,
    population: np.ndarray,
    landcover_class: np.ndarray,
    protected_area_dist_m: Optional[np.ndarray],
    protected_area_buffer_m: float = 5000.0,
    output_path: Optional[Path] = None,
    reference_profile: Optional[dict] = None,
) -> np.ndarray:
    """Compute the acquisition_friction_index raster.

    All input arrays must be co-registered (same shape, same transform).

    Args:
        building_density: Building KDE (buildings per 50m cell or similar density metric).
        population: Population count or density per 50m cell.
        landcover_class: Integer ESA WorldCover 2021 class codes.
        protected_area_dist_m: Distance to nearest WDPA polygon in metres.
            If None (WDPA unavailable), the protected-area component is set to 0.0
            and this is logged in metadata.
        protected_area_buffer_m: Distance (m) within which full protected-area penalty applies.
        output_path: If provided, write the result as a float32 GeoTIFF.
        reference_profile: rasterio profile dict for writing the output GeoTIFF.

    Returns:
        acquisition_friction_index as float32 numpy array, values in [0, 1].
    """
    shape = building_density.shape
    assert population.shape == shape, "population shape mismatch"
    assert landcover_class.shape == shape, "landcover_class shape mismatch"

    # --- Component 1: Building density (normalised to [0,1]) ---
    norm_building = _normalise(building_density.astype(np.float32))

    # --- Component 2: Population exposure (normalised to [0,1]) ---
    norm_population = _normalise(population.astype(np.float32))

    # --- Component 3: Land-use friction ---
    lu_friction = _landuse_friction_raster(landcover_class)

    # --- Component 4: Protected-area proximity score ---
    if protected_area_dist_m is not None:
        assert protected_area_dist_m.shape == shape, "protected_area_dist_m shape mismatch"
        # Linear decay: 1.0 at dist=0, 0.0 at dist=buffer_m
        pa_score = np.clip(
            1.0 - (protected_area_dist_m / protected_area_buffer_m),
            0.0, 1.0
        ).astype(np.float32)
    else:
        logger.warning(
            "WDPA data unavailable: protected_area_proximity component set to 0.0. "
            "acquisition_friction_index will NOT reflect protected-area proximity."
        )
        pa_score = np.zeros(shape, dtype=np.float32)

    # --- Weighted combination ---
    afi = (
        0.35 * norm_building +
        0.25 * norm_population +
        0.25 * lu_friction +
        0.15 * pa_score
    ).astype(np.float32)

    # Clip to [0, 1] (floating point safety)
    afi = np.clip(afi, 0.0, 1.0)

    if output_path is not None and reference_profile is not None:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        profile = reference_profile.copy()
        profile.update({"dtype": "float32", "count": 1, "nodata": -9999.0})
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(afi[np.newaxis, ...])
        logger.info("Written acquisition_friction_index to %s", output_path)

    return afi


def _normalise(arr: np.ndarray) -> np.ndarray:
    """Min-max normalise to [0, 1], handling nan and zero-range gracefully."""
    valid = arr[np.isfinite(arr)]
    if len(valid) == 0 or valid.max() == valid.min():
        return np.zeros_like(arr, dtype=np.float32)
    vmin, vmax = valid.min(), valid.max()
    normed = (arr - vmin) / (vmax - vmin)
    return np.clip(normed, 0.0, 1.0).astype(np.float32)


def _landuse_friction_raster(landcover_class: np.ndarray) -> np.ndarray:
    """Map ESA WorldCover class codes to friction scores in [0, 1]."""
    result = np.full(landcover_class.shape, DEFAULT_LANDUSE_FRICTION, dtype=np.float32)
    for class_code, friction in LANDUSE_FRICTION.items():
        result[landcover_class == class_code] = friction
    return result
