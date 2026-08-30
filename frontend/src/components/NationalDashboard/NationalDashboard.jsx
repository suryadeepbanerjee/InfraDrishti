import React from "react";
import { Activity, BarChart3, Globe, TrendingUp, Zap, Building, Target, Users } from "lucide-react";
import { InteractiveMap } from "../InteractiveMap";

export function NationalDashboard({ origin, destination, routesGeoJSON, scoredRoutes, selectedRouteId }) {
  return (
    <div className="plannerGrid" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Top Stats Row */}
      <div style={{ display: 'flex', gap: '15px', padding: '15px', background: 'rgba(4, 12, 19, 0.95)', borderBottom: '1px solid rgba(0, 240, 255, 0.1)', zIndex: 10 }}>
        
        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Globe size={24} color="#00f0ff" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>ACTIVE PROJECTS</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>1,204</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <TrendingUp size={24} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>CAPEX OPTIMIZED</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>$4.2B</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Activity size={24} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>RISK FACTORS MITIGATED</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>8,492</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Users size={24} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>POPULATION IMPACTED</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>42.5M</div>
          </div>
        </div>

      </div>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
        
        {/* Left Side Panels */}
        <div style={{ width: '340px', background: 'rgba(4, 12, 19, 0.95)', borderRight: '1px solid rgba(0, 240, 255, 0.1)', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
          
          <div className="panelGroup">
            <div className="groupTitleRow">
              <span className="titleText">NATIONAL PIPELINE</span>
              <span className="subBadge">Q3 2026</span>
            </div>
            
            <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#00f0ff', fontWeight: 700 }}>Delhi-Mumbai Expressway</span>
                  <span style={{ fontSize: '10px', color: '#10b981' }}>94%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: '#1a2b3c', borderRadius: '2px' }}>
                  <div style={{ width: '94%', height: '100%', background: '#10b981', borderRadius: '2px' }}></div>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#00f0ff', fontWeight: 700 }}>Pune IT Logistics Hub</span>
                  <span style={{ fontSize: '10px', color: '#f59e0b' }}>62%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: '#1a2b3c', borderRadius: '2px' }}>
                  <div style={{ width: '62%', height: '100%', background: '#f59e0b', borderRadius: '2px' }}></div>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#00f0ff', fontWeight: 700 }}>Kochi Water Metro Ext.</span>
                  <span style={{ fontSize: '10px', color: '#ef4444' }}>14%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: '#1a2b3c', borderRadius: '2px' }}>
                  <div style={{ width: '14%', height: '100%', background: '#ef4444', borderRadius: '2px' }}></div>
                </div>
              </div>

            </div>
          </div>

          <div className="panelGroup">
            <div className="groupTitleRow">
              <span className="titleText">SYSTEM ALERTS</span>
            </div>
            <div className="constraintsList" style={{ marginTop: '10px' }}>
              <div className="constraintRow" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <div className="rowIcon"><Activity size={13} color="#ef4444" /></div>
                <div className="rowText">
                  <div className="rowTitle" style={{ color: '#ef4444' }}>Seismic Risk Detected</div>
                  <div className="rowSub">Zone V overlap on Project NH-17</div>
                </div>
              </div>
              <div className="constraintRow" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                <div className="rowIcon"><Target size={13} color="#f59e0b" /></div>
                <div className="rowText">
                  <div className="rowTitle" style={{ color: '#f59e0b' }}>Clearance Pending</div>
                  <div className="rowSub">Wildlife board approval required</div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Map Area */}
        <div style={{ flex: 1, position: 'relative' }}>
          <InteractiveMap
            origin={origin}
            destination={destination}
            routesGeoJSON={routesGeoJSON}
            scoredRoutes={scoredRoutes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={() => {}}
            activeMode="DASHBOARD"
            setActiveMode={() => {}}
            hardConstraints={{ avoidWater: false, avoidForest: false, avoidBuildings: false }}
          />
          
          <div style={{ position: 'absolute', bottom: '30px', left: '30px', background: 'rgba(4, 12, 19, 0.85)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.2)', backdropFilter: 'blur(10px)' }}>
             <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#e2f1f5' }}>NATIONAL INTELLIGENCE FEED</h3>
             <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '10px', color: '#8daea8' }}>
               <li style={{ display: 'flex', gap: '8px' }}><Zap size={12} color="#00f0ff" /> Spatial model sync complete (2m ago)</li>
               <li style={{ display: 'flex', gap: '8px' }}><Building size={12} color="#10b981" /> 4 new industrial zones indexed</li>
               <li style={{ display: 'flex', gap: '8px' }}><Activity size={12} color="#f59e0b" /> Recalculating friction matrices...</li>
             </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
