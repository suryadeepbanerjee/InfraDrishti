import React from "react";
import { DollarSign, TrendingUp, Briefcase, Landmark, BarChart2, PieChart, LineChart } from "lucide-react";
import { InteractiveMap } from "../InteractiveMap";

export function MacroDashboard() {
  return (
    <div className="plannerGrid" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Top Stats Row */}
      <div style={{ display: 'flex', gap: '15px', padding: '15px', background: 'rgba(4, 12, 19, 0.95)', borderBottom: '1px solid rgba(0, 240, 255, 0.1)', zIndex: 10 }}>
        
        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <DollarSign size={24} color="#00f0ff" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>TOTAL CAPEX ALLOCATION</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>$142.5B</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <TrendingUp size={24} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>GDP MULTIPLIER (EST)</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>2.4x</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Briefcase size={24} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>REGIONAL EMPLOYMENT</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>4.2M <span style={{fontSize: '12px', color: '#f59e0b'}}>JOBS</span></div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Landmark size={24} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>FDI INFLOW LINKED</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>$28.4B</div>
          </div>
        </div>

      </div>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden', padding: '15px', gap: '15px', background: 'rgba(2, 6, 9, 1)' }}>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div className="evalCard" style={{ flex: 1 }}>
            <div className="cardHeaderTitleRow" style={{ marginBottom: '15px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><BarChart2 size={16} color="#00f0ff" /> SECTORAL INVESTMENT BREAKDOWN</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '11px', color: '#e2f1f5' }}>
                  <span>Transport & Logistics</span>
                  <span style={{ color: '#00f0ff' }}>45%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '45%', background: '#00f0ff' }}></div>
                </div>
              </div>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '11px', color: '#e2f1f5' }}>
                  <span>Energy & Grid</span>
                  <span style={{ color: '#10b981' }}>28%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '28%', background: '#10b981' }}></div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '11px', color: '#e2f1f5' }}>
                  <span>Urban Infrastructure</span>
                  <span style={{ color: '#f59e0b' }}>18%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '18%', background: '#f59e0b' }}></div>
                </div>
              </div>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '11px', color: '#e2f1f5' }}>
                  <span>Water & Sanitation</span>
                  <span style={{ color: '#8b5cf6' }}>9%</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '9%', background: '#8b5cf6' }}></div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="evalCard" style={{ flex: 1 }}>
            <div className="cardHeaderTitleRow" style={{ marginBottom: '15px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><LineChart size={16} color="#10b981" /> 10-YEAR ECONOMIC RATE OF RETURN (ERR)</span>
            </div>
            
            <div style={{ display: 'flex', height: '150px', alignItems: 'flex-end', gap: '10px', padding: '10px 0' }}>
              {[12, 15, 18, 24, 35, 45, 60, 75, 90, 100].map((val, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', height: '100%' }}>
                  <div style={{ width: '100%', height: `${val}%`, background: `linear-gradient(to top, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, ${val / 100}))`, borderRadius: '4px' }}></div>
                  <span style={{ fontSize: '9px', color: '#8daea8' }}>Y{i+1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
          <div className="evalCard" style={{ flex: 1, padding: 0, overflow: 'hidden', position: 'relative' }}>
            {/* We'll put the map here, treating it as an economic heat map */}
            <div style={{ position: 'absolute', top: 15, left: 15, zIndex: 10, background: 'rgba(0,0,0,0.7)', padding: '10px 15px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.3)' }}>
              <h3 style={{ margin: 0, fontSize: '12px', color: '#00f0ff' }}>MACRO-ECONOMIC ACTIVITY INDEX</h3>
              <p style={{ margin: '5px 0 0 0', fontSize: '10px', color: '#8daea8' }}>Live tracking of capital deployment across major corridors.</p>
            </div>
            <InteractiveMap
              origin={null}
              destination={null}
              routesGeoJSON={null}
              scoredRoutes={[]}
              selectedRouteId={null}
              onSelectRoute={() => {}}
              activeMode="DASHBOARD"
              setActiveMode={() => {}}
              hardConstraints={{ avoidWater: false, avoidForest: false, avoidBuildings: false }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
