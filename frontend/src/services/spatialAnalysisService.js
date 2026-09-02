/**
 * Corridor planning helpers (client-side presentation only).
 *
 * All geospatial computation and MCDA scoring is performed by the backend.
 * This module only maps UI state to a valid backend request and normalises
 * backend responses into a shape the UI can render.
 */

/**
 * Map the descriptive infrastructure class (UI) to a canonical backend
 * infrastructure_type.
 */
export function mapInfraClassToType(infraClass) {
  const map = {
    "Heavy Rail (Freight)": "railway",
    "High-Speed Rail": "railway",
    "Expressway (6-Lane)": "highway",
    "Power Transmission Line": "power_transmission",
    "Pipeline Corridor": "highway",
  };
  return map[infraClass] || "highway";
}

/**
 * Map the three UI MCDA sliders to backend metric weights (%-based, 0-100).
 * The backend validates, merges and normalises these — the frontend is never
 * authoritative.
 */
export function mapUiWeightsToMcda({ terrain, landCost, ecological }) {
  return {
    mean_slope_deg: (terrain || 0) / 100,
    acquisition_friction_index: (landCost || 0) / 100,
    forest_overlap_km2: (ecological || 0) / 100,
    population_exposure: (ecological || 0) / 100,
  };
}

/**
 * Normalize a backend GeoJSON + features into the route list the UI renders.
 * Returns { geojson, scoredRoutes } where scoredRoutes carries backend values.
 */
export function normalizeCorridorResponse(data) {
  if (!data) return { geojson: { type: "FeatureCollection", features: [] }, scoredRoutes: [], diversity: [] };

  // Support direct FeatureCollection, wrapped geojson, or data.result/data.data structures
  const geojson = (data.type === "FeatureCollection" ? data : null)
    || data.geojson
    || data.result?.geojson
    || data.data?.geojson
    || (Array.isArray(data.features) ? { type: "FeatureCollection", features: data.features } : { type: "FeatureCollection", features: [] });

  const rawFeatures = Array.isArray(geojson.features) ? geojson.features : [];

  // Helper to ensure coordinates are [lon, lat] (EPSG:4326)
  const fixCoords = (c) => {
    if (!Array.isArray(c)) return c;
    if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const [x, y] = c;
      // In India, Lon is ~68-98 and Lat is ~8-37. If x < 40 and y > 50, swap!
      if (x < 45 && y >= 50) return [y, x];
      return [x, y];
    }
    return c.map(fixCoords);
  };

  const cleanFeatures = [];

  const scoredRoutes = rawFeatures.map((feat, idx) => {
    const p = { ...(feat.properties || {}) };
    const featId = p.id || feat.id || `R-${idx + 1}`;
    const rank = p.rank != null ? p.rank : (idx + 1);
    const relRaw = p.mcda_score_relative ?? p.mcda_score ?? p.score ?? 0;
    const absRaw = p.mcda_score_absolute ?? p.mcda_score ?? p.score ?? 0;

    p.id = featId;
    p.rank = rank;

    let cleanGeom = null;
    if (feat.geometry && feat.geometry.coordinates) {
      cleanGeom = {
        type: feat.geometry.type || "LineString",
        coordinates: fixCoords(feat.geometry.coordinates),
      };
    }

    cleanFeatures.push({
      type: "Feature",
      id: featId,
      properties: p,
      geometry: cleanGeom,
    });

    return {
      id: featId,
      name: p.name || `Alignment ${featId}`,
      tag: rank === 1 ? "OPTIMAL" : "ALTERNATIVE",
      rank: rank,
      score: Math.round(Number(relRaw) <= 1 && Number(relRaw) > 0 ? Number(relRaw) * 100 : Number(relRaw)),
      scoreRaw: relRaw,
      scoreAbsolute: absRaw,
      lengthKm: round1(p.metrics?.route_length_km ?? p.length_km),
      gridSnapM: p.origin_error_m != null ? round1(p.origin_error_m) : null,
      metrics: p.metrics || {},
      normalizedMetrics: p.normalized_metrics || {},
      weights: p.weights || {},
      weightedContributions: p.weighted_contributions || {},
      explanation: p.explanation || null,
    };
  });

  return {
    geojson: { type: "FeatureCollection", features: cleanFeatures },
    scoredRoutes,
    diversity: data.diversity_metrics || []
  };
}

function round1(v) {
  return v == null ? null : Math.round(Number(v) * 10) / 10;
}

export function scoreDisplay(raw) {
  if (raw == null) return null;
  return Math.round(raw * 100);
}

/**
 * Normalizes backend /site/find response.
 * Sanitizes Polygon coordinates, extracts metrics, weights, and explanation.
 */
export function normalizeSiteFinderResponse(data) {
  if (!data) return { geojson: { type: "FeatureCollection", features: [] }, scoredSites: [] };

  const rawGeo = (data.type === "FeatureCollection" ? data : null)
    || data.geojson
    || data.result?.geojson
    || (Array.isArray(data.features) ? { type: "FeatureCollection", features: data.features } : { type: "FeatureCollection", features: [] });

  const rawFeatures = Array.isArray(rawGeo.features) ? rawGeo.features : [];

  const fixCoords = (c) => {
    if (!Array.isArray(c)) return c;
    if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const [x, y] = c;
      if (x < 45 && y >= 50) return [y, x];
      return [x, y];
    }
    return c.map(fixCoords);
  };

  const cleanFeatures = [];

  const scoredSites = rawFeatures.map((feat, idx) => {
    const p = { ...(feat.properties || {}) };
    const siteId = p.id || feat.id || `SITE-${idx + 1}`;
    const rank = p.rank != null ? p.rank : (idx + 1);
    const scoreRaw = p.mcda_score ?? p.score ?? 0;

    p.id = siteId;
    p.rank = rank;

    let cleanGeom = null;
    if (feat.geometry) {
      cleanGeom = {
        type: feat.geometry.type || "Polygon",
        coordinates: fixCoords(feat.geometry.coordinates),
      };
    }

    cleanFeatures.push({
      type: "Feature",
      id: siteId,
      properties: p,
      geometry: cleanGeom,
    });

    return {
      id: siteId,
      name: `Candidate ${siteId}`,
      tag: rank === 1 ? "OPTIMAL" : "ALTERNATIVE",
      rank: rank,
      scoreRaw: scoreRaw,
      score: Math.round(Number(scoreRaw) <= 1 && Number(scoreRaw) > 0 ? Number(scoreRaw) * 100 : Number(scoreRaw)),
      metrics: p.metrics || {},
      rawMetrics: p.raw_metrics || {},
      weights: p.weights || {},
      weightedContributions: p.weighted_contributions || {},
      explanation: p.explanation || null,
    };
  });

  return {
    geojson: { type: "FeatureCollection", features: cleanFeatures },
    scoredSites,
  };
}