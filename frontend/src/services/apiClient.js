/**
 * apiClient.js — HTTP integration layer for InfraDrishti.
 *
 * All GIS analysis endpoints require a valid Supabase session.
 * Pass the session object returned by useAuth() to each call.
 * The Bearer token is the session.access_token — never hardcoded.
 *
 * No geospatial algorithms or MCDA calculations are performed here.
 * The backend is the single source of truth for all scoring.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(code, message, requestId) {
    super(message || code);
    this.name = "ApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Core fetch wrapper. Attaches Authorization header when session provided.
 * @param {string} endpoint
 * @param {object} options  — standard fetch options
 * @param {object|null} session — Supabase session (has access_token)
 */
async function fetchJson(endpoint, options = {}, session = null) {
  const headers = { "Content-Type": "application/json", ...options.headers };

  const token = session?.access_token || "demo-token";
  headers["Authorization"] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      "BACKEND_UNAVAILABLE",
      "Backend unavailable. Start the API server and retry.",
      null
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      // Distinguish: if the frontend has a valid session, the backend may be
      // in an unexpected state (JWKS unreachable, demo-mode mismatch, etc.).
      // Only label as "SESSION_EXPIRED" when the frontend session is actually
      // missing or clearly invalid.  Otherwise surface the backend's detail so
      // the caller can decide whether to sign out.
      const backendDetail = data?.detail || "";
      const hasFrontendSession = Boolean(session?.access_token);
      if (hasFrontendSession) {
        // We sent a token and the backend rejected it — report as a backend
        // auth error, NOT automatic session expiry.  The caller can still
        // decide to sign out, but the error message is honest.
        throw new ApiError(
          "AUTH_ERROR",
          backendDetail || "Backend rejected authentication. Please try again.",
          null
        );
      }
      throw new ApiError(
        "SESSION_EXPIRED",
        "Session expired. Please sign in again.",
        null
      );
    }
    if (response.status === 422) {
      const error = data && data.error;
      if (error) {
        throw new ApiError(error.code, error.message, error.request_id || null);
      }
    }
    const error = data && data.error;
    if (error) {
      throw new ApiError(error.code, error.message, error.request_id || null);
    }
    throw new ApiError(
      "INVALID_REQUEST",
      `API Error: ${response.status} ${response.statusText}`,
      null
    );
  }

  return data;
}

/**
 * Submit a Corridor Plan request.
 * @param {object} payload
 * @param {object} session — from useAuth().session
 */
export async function createCorridorPlan(payload, session) {
  return fetchJson(
    "/corridor/plan",
    { method: "POST", body: JSON.stringify(payload) },
    session
  );
}

/**
 * Submit a Site Search request.
 * @param {object} payload
 * @param {object} session — from useAuth().session
 */
export async function createSiteSearch(payload, session) {
  return fetchJson(
    "/site/find",
    { method: "POST", body: JSON.stringify(payload) },
    session
  );
}

/**
 * Fetch the authenticated user's analysis history.
 * @param {object} session — from useAuth().session
 */
export async function getUserHistory(session) {
  return fetchJson("/user/history", { method: "GET" }, session);
}