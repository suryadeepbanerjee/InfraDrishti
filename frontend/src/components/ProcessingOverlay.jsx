import React from 'react';
import { Loader2, CheckCircle2, AlertOctagon } from 'lucide-react';
import './ProcessingOverlay.css';

// Truthful processing states only. The backend is synchronous, so we expose
// PROCESSING / COMPLETED / FAILED — no fabricated percentage progress.
export function ProcessingOverlay({
  status,
  error,
  onDismiss,
  title = "PROCESSING REQUEST",
  subtitle = "LEAST-COST CORRIDOR COMPUTATION",
  caption = "Computing least-cost path over validated raster layers (DEM, water, protected areas, population, land cover)."
}) {
  if (!status && !error) return null;

  const isComplete = status === 'COMPLETED';
  const isError = status === 'FAILED' || Boolean(error);

  return (
    <div className="processingOverlay">
      <div className="processingModal">
        {isError ? (
          <div className="errorState">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
              <AlertOctagon size={20} />
              <span style={{ fontSize: '13px', fontWeight: 800 }}>ANALYSIS FAILED</span>
            </div>
            <p className="errorMessage">{error || 'The spatial analysis request failed.'}</p>
            <div>
              <button onClick={onDismiss} className="dismissBtn">Dismiss</button>
            </div>
          </div>
        ) : isComplete ? (
          <div className="successState">
            <CheckCircle2 size={32} color="#10b981" />
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>ANALYSIS COMPLETED</div>
            <p style={{ fontSize: '11px', color: '#64748b' }}>Spatial analysis and multi-criteria scores are ready.</p>
          </div>
        ) : (
          <div>
            <div className="processingModalHeader">
              <div className="processingIconWrap">
                <Loader2 size={18} className="spinIcon" color="#ea580c" />
              </div>
              <div>
                <div className="processingModalTitle">{title}</div>
                <div className="processingModalSubtitle">{subtitle}</div>
              </div>
            </div>
            <div className="statusBadgeRow">
              <span className="statusBadgeStage">[{status ? status.replace(/_/g, ' ') : 'PROCESSING'}]</span>
            </div>
            <div className="modalDisclaimer">
              {caption}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}