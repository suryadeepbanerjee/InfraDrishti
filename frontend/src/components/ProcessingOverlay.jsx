import React from 'react';
import { Loader2, Server, Database, Activity, CheckCircle, AlertOctagon } from 'lucide-react';
import './ProcessingOverlay.css';

export function ProcessingOverlay({ status, error, onDismiss }) {
  if (!status && !error) return null;

  const isComplete = status === 'COMPLETED';
  const isError = status === 'FAILED' || error;

  const stages = [
    'QUEUED',
    'DISCOVERING_DATA',
    'DOWNLOADING',
    'VALIDATING_DATA',
    'PREPROCESSING',
    'FEATURE_ENGINEERING',
    'RUNNING_ANALYSIS',
    'GENERATING_OUTPUT',
    'VALIDATING_OUTPUT',
    'CLEANING_UP',
    'COMPLETED'
  ];

  const currentIndex = stages.indexOf(status);

  return (
    <div className="processingOverlay">
      <div className="processingModal">
        {isError ? (
          <div className="errorState">
            <AlertOctagon size={48} className="errorIcon" />
            <h3>BACKEND PROCESSING FAILED</h3>
            <p className="errorMessage">{error || 'Unknown backend error.'}</p>
            <div className="errorActions">
              <button onClick={onDismiss} className="dismissBtn">Dismiss & Try Again</button>
            </div>
          </div>
        ) : isComplete ? (
          <div className="successState">
            <CheckCircle size={48} className="successIcon" />
            <h3>ANALYSIS COMPLETE</h3>
            <p>Spatial geometries generated successfully.</p>
          </div>
        ) : (
          <div className="loadingState">
            <Loader2 size={40} className="spinIcon text-cyan" />
            <h3>LIVE SPATIAL PROCESSING</h3>
            <p className="statusText">Current Stage: <strong>{status.replace(/_/g, ' ')}</strong></p>
            
            <div className="stagesList">
              {stages.map((stage, idx) => {
                let icon = <Database size={12} />;
                let colorClass = 'stagePending';
                
                if (idx < currentIndex) {
                  icon = <CheckCircle size={12} />;
                  colorClass = 'stageDone';
                } else if (idx === currentIndex) {
                  icon = <Activity size={12} className="spinIcon" />;
                  colorClass = 'stageActive';
                }

                // Only show active and immediately surrounding steps to prevent clutter
                if (Math.abs(idx - currentIndex) > 2 && idx !== stages.length - 1) return null;

                return (
                  <div key={stage} className={`stageItem ${colorClass}`}>
                    {icon}
                    <span>{stage.replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="modalDisclaimer">
              * The backend spatial engine is performing deterministic analysis.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
