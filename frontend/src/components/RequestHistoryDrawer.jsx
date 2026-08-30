import React from 'react';
import { Clock, CheckCircle, AlertOctagon, X, MapPin, Target } from 'lucide-react';

export function RequestHistoryDrawer({ isOpen, onClose, historyLogs = [] }) {
  // Merge live session history with mock persistent history
  const displayHistory = [
    ...historyLogs,
    {
      id: 'REQ-9921',
      type: 'Corridor Analysis',
      infra_type: 'Highway',
      location: 'Delhi NCR → Jaipur',
      timestamp: '2 mins ago',
      status: 'COMPLETED'
    },
    {
      id: 'REQ-9920',
      type: 'Site Search',
      infra_type: 'Logistics Hub',
      location: 'Mumbai (50 Acres)',
      timestamp: '1 hour ago',
      status: 'COMPLETED'
    },
    {
      id: 'REQ-9919',
      type: 'Corridor Analysis',
      infra_type: 'Railway',
      location: 'Pune → Nashik',
      timestamp: '3 hours ago',
      status: 'FAILED'
    }
  ];

  return (
    <div className={`historyDrawer ${isOpen ? 'open' : ''}`}>
      <div className="historyHeader">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} className="cyanIcon" />
          <h3 style={{ margin: 0, fontSize: '12px', letterSpacing: '1px', color: '#e2f1f5' }}>REQUEST HISTORY</h3>
        </div>
        <button className="closeBtn" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="historyList">
        {displayHistory.map((req, i) => (
          <div key={req.id || i} className="historyItem">
            <div className="historyRow1">
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#e2f1f5' }}>{req.type}</span>
              <span className={`statusPill ${req.status === 'COMPLETED' ? 'success' : 'error'}`}>
                {req.status === 'COMPLETED' ? <CheckCircle size={10} /> : <AlertOctagon size={10} />}
                {req.status}
              </span>
            </div>
            
            <div className="historyRow2">
              <span className="infraBadge">{req.infra_type}</span>
              <span style={{ fontSize: '10px', color: '#8daea8' }}>{req.timestamp}</span>
            </div>

            <div className="historyRow3" style={{ fontSize: '11px', color: '#00f0ff', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {req.type === 'Corridor Analysis' ? <Target size={12} /> : <MapPin size={12} />}
              {req.location}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
