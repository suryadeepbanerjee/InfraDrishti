import buildingsData from '../data/buildings.json' with { type: 'json' };
import constraintsData from '../data/constraints.json' with { type: 'json' };
import landcoverData from '../data/landcover.json' with { type: 'json' };
import waterData from '../data/water.json' with { type: 'json' };
import demoRoutesData from '../data/demoRoutes.json' with { type: 'json' };

import { getCorridorRoutes } from './routingService.js';
import { scoreAllRoutes } from './spatialAnalysisService.js';

/**
 * Backend-Ready Spatial Data Service
 * Provides an abstraction layer between Map UI and spatial datasets.
 * Can seamlessly switch from local GeoJSON imports to REST/GraphQL APIs
 * (e.g. GET /api/spatial/buildings, POST /api/analyze-corridor).
 */

export async function getBuildings() {
  // In production, this can call: await fetch('/api/spatial/buildings')
  return buildingsData;
}

export async function getWaterBodies() {
  // In production, this can call: await fetch('/api/spatial/water')
  return waterData;
}

export async function getLandcover() {
  // In production, this can call: await fetch('/api/spatial/landcover')
  return landcoverData;
}

export async function getConstraints() {
  // In production, this can call: await fetch('/api/spatial/constraints')
  return constraintsData;
}

export async function getCorridors() {
  // In production, this can call: await fetch('/api/spatial/corridors')
  return demoRoutesData;
}

/**
 * AI/ML Backend-Ready Corridor Analysis Endpoint Abstraction
 * Currently executes client-side Turf.js engine, structured for future POST /api/analyze-corridor
 *
 * @param {Object} params
 * @param {Object} params.origin - { name, coords: [lon, lat] }
 * @param {Object} params.destination - { name, coords: [lon, lat] }
 * @param {Object} params.hardConstraints - { avoidForest, avoidWater, avoidSlope, avoidBuildings }
 * @param {Object} params.softFactorWeights - { population, terrain, infrastructure }
 * @returns {Promise<Object>} { routesGeoJSON, scoredRoutes, isDemoData }
 */
export async function analyzeCorridor({
  origin,
  destination,
  hardConstraints,
  softFactorWeights
}) {
  // 1. Fetch driving corridor geometry via Routing Service (OSRM or local GeoJSON fallback)
  const routesGeoJSON = await getCorridorRoutes(origin.coords, destination.coords);

  // 2. Fetch spatial layers
  const [buildings, water, landcover, constraints] = await Promise.all([
    getBuildings(),
    getWaterBodies(),
    getLandcover(),
    getConstraints()
  ]);

  // 3. Run spatial decision analysis
  const scoredRoutes = scoreAllRoutes({
    routesGeoJSON,
    constraintsGeoJSON: constraints,
    buildingsGeoJSON: buildings,
    waterGeoJSON: water,
    landcoverGeoJSON: landcover,
    hardConstraints,
    weights: softFactorWeights
  });

  return {
    routesGeoJSON,
    scoredRoutes,
    isDemoData: routesGeoJSON.isDemoData || false,
    spatialLayers: {
      buildings,
      water,
      landcover,
      constraints
    }
  };
}
