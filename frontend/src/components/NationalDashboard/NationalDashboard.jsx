import React, { useEffect, useState } from "react";
import { Activity, MapPin, Loader } from "lucide-react";
import { getUserHistory } from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";

// Dashboard that fetches real analysis history from Supabase via the backend.
export function NationalDashboard({ historyLogs: sessionLogs = [], lastResult = [] }) {
  const { session } = useAuth();
  const [dbHistory, setDbHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    getUserHistory(session)
      .then((data) => {
        if (!cancelled) setDbHistory(data.history || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [session]);

  // Merge: Supabase history takes precedence, fall back to session-only logs
  const allLogs = dbHistory.length > 0
    ? dbHistory.map((row) => ({
        id: row.id,
        type: row.analysis_type === "corridor" ? "Corridor Analysis" : "Site Search",
        status: row.status,
        title: row.title,
        origin: row.origin_name,
        destination: row.destination_name,
        infrastructure_type: row.infrastructure_type,
        facility_type: row.facility_type,
        created_at: row.created_at,
        error_message: row.error_message,
      }))
    : sessionLogs;

  const corridorCount = allLogs.filter(h => h.type === "Corridor Analysis").length;
  const siteCount = allLogs.filter(h => h.type === "Site Search").length;
  const successCount = allLogs.filter(h => h.status === "COMPLETED").length;
  const failCount = allLogs.filter(h => h.status !== "COMPLETED").length;

  const best = lastResult[0];

  return (
    <div style={{ padding: '20px 24px', background: '#f9fafb', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>National Dashboard</h2>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
          {dbHistory.length > 0
            ? "Analysis history loaded from Supabase."
            : "Session-scoped summary of actual analyses (DEMO view — not national statistics)."}
        </p>
      </div>

      <div className="nationalKpiGrid" style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
        <Metric label="Corridor analyses" value={corridorCount} />
        <Metric label="Site analyses" value={siteCount} />
        <Metric label="Successful" value={successCount} tone="ok" />
        <Metric label="Failed" value={failCount} tone={failCount > 0 ? "bad" : "neutral"} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Validated data coverage</div>
        <div style={{ fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={14} color="#2563eb" />
          Latur–Osmanabad, Maharashtra — lon 75.80–76.81, lat 17.89–18.61 (50 m resolution). Requests outside this AOI return DATA_COVERAGE_BLOCKER.
        </div>
      </div>

      {best && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Highest-scoring route in this session</div>
          <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
            <div>Route: {best.id} — MCDA score {(best.scoreRaw ?? 0).toFixed(3)}</div>
            <div>Length: {best.lengthKm != null ? `${best.lengthKm} km` : '—'} · Population exposure: {best.metrics?.population_exposure ?? '—'}</div>
            <div>AFI: {best.metrics?.acquisition_friction_index ?? '—'} · Forest overlap: {best.metrics?.forest_overlap_km2 ?? '—'} km²</div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#3b82f6', padding: '8px 0' }}>
          <Loader size={14} className="spinIcon" /> Loading history from Supabase…
        </div>
      )}

      {error && (
        <div style={{ fontSize: '12px', color: '#ef4444', padding: '8px 10px', background: '#fef2f2', borderRadius: '5px', marginBottom: '8px' }}>
          {error}
        </div>
      )}

      {!loading && allLogs.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#9ca3af' }}>
          <Activity size={14} /> No analyses run yet.
        </div>
      )}

      {!loading && allLogs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {allLogs.map((row) => (
            <div key={row.id || row.title} style={{
              background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: '8px', padding: '12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                  {row.type} — {row.title || `${row.origin || '—'} → ${row.destination || '—'}`}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {row.infrastructure_type || row.facility_type || '—'}
                  {row.created_at ? ` · ${new Date(row.created_at).toLocaleString()}` : ''}
                </div>
                {row.status === "FAILED" && row.error_message && (
                  <div style={{ fontSize: '10px', color: '#ef4444', fontStyle: 'italic', marginTop: '2px' }}>
                    {row.error_message}
                  </div>
                )}
              </div>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                background: row.status === "COMPLETED" ? "#ecfdf5" : row.status === "PROCESSING" ? "#eff6ff" : "#fef2f2",
                color: row.status === "COMPLETED" ? "#10b981" : row.status === "PROCESSING" ? "#3b82f6" : "#ef4444",
              }}>
                {row.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }) {
  const color = tone === "ok" ? '#10b981' : tone === "bad" ? '#ef4444' : '#0f172a';
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 600, color }}>{value}</div>
    </div>
  );
}