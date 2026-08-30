/**
 * API Integration Layer
 * 
 * Contains ONLY HTTP calls and frontend response typing.
 * No geospatial algorithms or MCDA calculations are performed here.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

/**
 * Helper to handle API responses and standard errors
 */
async function fetchJson(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message || data?.error || `API Error: ${response.status} ${response.statusText}`);
    }

    return data;
  } catch (error) {
    console.error(`[API Error] ${endpoint}:`, error);
    throw error;
  }
}

/**
 * CORRIDOR API
 */

/**
 * Submit a new Corridor Plan request
 * @param {Object} payload 
 * @param {string} payload.infrastructure_type
 * @param {Object} payload.origin - { name, lon, lat }
 * @param {Object} payload.destination - { name, lon, lat }
 * @param {number} payload.corridor_width_m
 * @param {number} payload.n_routes
 * @returns {Promise<{ request_id: string }>}
 */
export async function createCorridorPlan(payload) {
  return fetchJson('/corridor/plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch a Corridor Plan result directly (if synchronous)
 * @param {string} requestId 
 * @returns {Promise<Object>} CorridorResponse
 */
export async function getCorridorResult(requestId) {
  return fetchJson(`/corridor/result/${requestId}`);
}


/**
 * SITE FINDER API
 */

/**
 * Submit a new Site Search request
 * @param {Object} payload 
 * @param {string} payload.facility_type
 * @param {Object} payload.location - { lat, lon }
 * @param {number} payload.required_area_acres
 * @param {Object} payload.requirements
 * @returns {Promise<{ request_id: string }>}
 */
export async function createSiteSearch(payload) {
  return fetchJson('/site/find', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch a Site Search result directly
 * @param {string} requestId 
 * @returns {Promise<Object>} SiteResponse
 */
export async function getSiteResult(requestId) {
  return fetchJson(`/site/result/${requestId}`);
}


/**
 * SHARED PROCESSING STATUS API
 */

/**
 * Check the async processing status of a request
 * @param {string} requestId 
 * @returns {Promise<{ status: string, message: string, progress: number }>}
 */
export async function getProcessingStatus(requestId) {
  return fetchJson(`/status/${requestId}`);
}
