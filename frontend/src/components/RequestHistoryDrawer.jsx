/**
 * RequestHistoryDrawer.jsx — Real user-scoped analysis history.
 *
 * Fetches from GET /api/v1/user/history using the authenticated session.
 * Only the current user's records are returned (enforced by backend JWT + RLS).
 * No fake entries, no Math.random() IDs.
 */
import React, { useEffect, useState } from "react";
import { Clock, CheckCircle, AlertOctagon, X, MapPin, Target, RefreshCw, Loader } from "lucide-react";
import { getUserHistory } from "../services/apiClient";

export function RequestHistoryDrawer({ isOpen, onClose, session }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchHistory = async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const data = await getUserHistory(session);
      setHistory(data.history || []);
    } catch (e) {
      setError(e.message || "Failed to load history.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch when drawer opens
  useEffect(() => {
    if (isOpen) fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session]);

  if (!isOpen) return null;

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const locationLabel = (row) => {
    if (row.analysis_type === "corridor" && row.origin_name && row.destination_name)
      return `${row.origin_name} → ${row.destination_name}`;
    if (row.origin_lat != null)
      return `${row.origin_lat.toFixed(4)}, ${row.origin_lon.toFixed(4)}`;
    return "—";
  };

  return (
    <div className="drawerOverlay" onClick={onClose}>
      <div className="sideDrawerCard" onClick={(e) => e.stopPropagation()}>
        <div className="drawerHeader">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={16} color="#0f172a" />
            <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#0f172a", letterSpacing: "0.5px" }}>
              ANALYSIS HISTORY
            </h3>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button
              className="iconActionBtn"
              onClick={fetchHistory}
              title="Refresh"
              disabled={loading}
              style={{ opacity: loading ? 0.5 : 1 }}
            >
              {loading ? <Loader size={14} /> : <RefreshCw size={14} />}
            </button>
            <button className="iconActionBtn" onClick={onClose} title="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="drawerBody" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {loading && history.length === 0 && (
            <div style={{ fontSize: "12px", color: "#9ca3af", display: "flex", alignItems: "center", gap: "6px" }}>
              <Loader size={12} /> Loading history…
            </div>
          )}

          {error && (
            <div style={{ fontSize: "12px", color: "#ef4444", padding: "8px 10px", background: "#fef2f2", borderRadius: "5px" }}>
              {error}
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <p style={{ fontSize: "12px", color: "#9ca3af" }}>
              No analyses yet. Run a corridor or site analysis to see history.
            </p>
          )}

          {history.map((row) => (
            <div
              key={row.id}
              style={{
                background: "#ffffff", border: "1px solid #e2e8f0",
                borderRadius: "8px", padding: "12px",
                display: "flex", flexDirection: "column", gap: "6px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", textTransform: "capitalize" }}>
                  {row.analysis_type === "corridor" ? "Corridor Analysis" : "Site Finder"}
                </span>
                <span style={{
                  fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                  background: row.status === "COMPLETED" ? "#ecfdf5" : row.status === "PROCESSING" ? "#eff6ff" : "#fef2f2",
                  color: row.status === "COMPLETED" ? "#10b981" : row.status === "PROCESSING" ? "#3b82f6" : "#ef4444",
                  display: "inline-flex", alignItems: "center", gap: "4px",
                }}>
                  {row.status === "COMPLETED"
                    ? <><CheckCircle size={10} /> {row.status}</>
                    : row.status === "PROCESSING"
                    ? <><Loader size={10} /> {row.status}</>
                    : <><AlertOctagon size={10} /> {row.status}</>}
                </span>
              </div>

              {row.title && (
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e40af" }}>{row.title}</div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>
                  {row.infrastructure_type || row.facility_type || "—"}
                </span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>{fmtDate(row.created_at)}</span>
              </div>

              <div style={{ fontSize: "11px", color: "#2563eb", display: "flex", alignItems: "center", gap: "4px" }}>
                {row.analysis_type === "corridor" ? <Target size={11} /> : <MapPin size={11} />}
                <span>{locationLabel(row)}</span>
              </div>

              {row.status === "FAILED" && row.error_message && (
                <div style={{ fontSize: "10px", color: "#ef4444", fontStyle: "italic" }}>
                  {row.error_message}
                </div>
              )}

              {row.request_id && (
                <div style={{ fontSize: "10px", color: "#cbd5e1", fontFamily: "monospace" }}>
                  {row.request_id}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}