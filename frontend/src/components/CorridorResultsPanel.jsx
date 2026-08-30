import React from 'react';
import { AlertTriangle, Check, Target, Info, Crown } from 'lucide-react';

export function CorridorResultsPanel({ routes }) {
  if (!routes || routes.length === 0) return null;

  // The backend already ranks them, we assume routes are sorted or we can sort them by rank
  const sortedRoutes = [...routes].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const bestRoute = sortedRoutes[0];

  return (
    <div className="evalCardsGrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
      
      {/* 1. WHY THIS ROUTE RANKED HERE (Explanation) */}
      <div className="evalCard recommendedCard" style={{ gridColumn: 'span 1' }}>
        <div className="recCardTitleRow">
          <div className="crownIcon"><Crown size={18} /></div>
          <div>
            <div className="recTitle">HIGHEST SUITABILITY SCORE</div>
            <div className="recRouteSub"><strong>{bestRoute.id}</strong></div>
          </div>
          <div className="recScoreBadge">
            <span>{bestRoute.mcda_score?.toFixed(1)}</span>
            <div className="recTagPill">RANK 1</div>
          </div>
        </div>

        {bestRoute.explanation && (
          <div style={{ marginTop: '15px', zIndex: 10, position: 'relative' }}>
            <h4 style={{ fontSize: '11px', color: '#8daea8', marginBottom: '8px' }}>KEY ADVANTAGES</h4>
            <ul className="recChecklist" style={{ marginBottom: '15px' }}>
              {bestRoute.explanation.advantages?.map((adv, idx) => (
                <li key={idx}><Check size={12} className="greenCheck" /> {adv}</li>
              ))}
            </ul>

            <h4 style={{ fontSize: '11px', color: '#8daea8', marginBottom: '8px' }}>TRADE-OFFS</h4>
            <ul className="recChecklist">
              {bestRoute.explanation.trade_offs?.map((trd, idx) => (
                <li key={idx}><AlertTriangle size={12} style={{ color: '#fbbf24', marginRight: '8px' }} /> {trd}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="targetRadarBackdrop"></div>
      </div>

      {/* 2. ROUTE COMPARISON TABLE */}
      <div className="evalCard" style={{ gridColumn: 'span 2' }}>
        <div className="cardHeaderTitleRow">
          <span>ROUTE COMPARISON MATRIX</span>
        </div>
        
        <div className="comparisonTableWrapper" style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table className="comparisonTable" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0, 240, 255, 0.2)' }}>
                <th style={{ padding: '8px', color: '#8daea8' }}>METRIC</th>
                {sortedRoutes.map(r => {
                  let color = '#e2f1f5';
                  if (r.isInfeasible) color = '#ef4444';
                  else if (r.rank === 1) color = '#10b981';
                  else color = '#eab308';
                  return (
                    <th key={r.id} style={{ padding: '8px', color }}>
                      {r.id} {r.rank === 1 && <span style={{ fontSize: '9px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>BEST</span>}
                      {r.isInfeasible && <span style={{ fontSize: '9px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px' }}>BLOCKED</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Rank</td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{r.rank || 'N/A'}</td>)}
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>MCDA Score</td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold' }}>{r.mcda_score?.toFixed(1) || 'N/A'}</td>)}
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Length (km)</td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{r.metrics?.length_km?.toFixed(1) ?? 'N/A'}</td>)}
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Population Exp.</td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{r.metrics?.population_exposure?.toLocaleString() ?? 'N/A'}</td>)}
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Building Impact</td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{r.metrics?.building_impact ?? 'N/A'}</td>)}
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>River Crossings</td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{r.metrics?.river_crossings ?? 'N/A'}</td>)}
              </tr>
              <tr>
                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Max Slope (%)</td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{r.metrics?.max_slope_pct?.toFixed(1) ?? 'N/A'}</td>)}
              </tr>
              <tr>
                <td style={{ padding: '8px' }}>
                  Acquisition Friction <Info size={10} style={{display:'inline', marginLeft:'2px', cursor:'help'}} title="Spatial screening index based on available proxies. It is not legal ownership verification, acquisition probability, or a financial estimate."/>
                </td>
                {sortedRoutes.map(r => <td key={r.id} style={{ padding: '8px' }}>{r.metrics?.acquisition_friction_index?.toFixed(2) ?? 'N/A'}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. DATA PROVENANCE (if provided) */}
      {bestRoute.explanation?.provenance && (
        <div className="evalCard" style={{ gridColumn: 'span 3', padding: '15px' }}>
          <div className="cardHeaderTitleRow">
            <span>DATA PROVENANCE & METHODOLOGY</span>
          </div>
          <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
            {bestRoute.explanation.provenance.map((prov, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '6px', flex: 1, border: '1px solid rgba(255,255,255,0.05)' }}>
                <strong style={{ display: 'block', color: '#00f0ff', fontSize: '11px' }}>{prov.dataset}</strong>
                <span style={{ fontSize: '10px', color: '#8daea8' }}>Source: {prov.source} | Res: {prov.resolution}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
