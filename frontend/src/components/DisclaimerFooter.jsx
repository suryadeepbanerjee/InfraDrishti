import React from 'react';

export function DisclaimerFooter() {
  return (
    <div style={{
      padding: '8px 20px',
      background: 'rgba(0, 0, 0, 0.75)',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      fontSize: '9px',
      color: '#557973',
      textAlign: 'center',
      zIndex: 100,
      position: 'relative'
    }}>
      <strong>DISCLAIMER:</strong> This platform is a planning-support tool. Results are NOT legal ownership verification, final engineering design, environmental clearance, or exact compensation estimation. Population values are estimates. <code>acquisition_friction_index</code> is a spatial screening proxy only. Real decisions require legal, engineering, survey, and environmental validation.
    </div>
  );
}
