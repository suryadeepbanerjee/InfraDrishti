import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  ChevronRight,
  MapPin,
  ShieldCheck,
  Droplets,
  Building2,
  Mountain,
  Route,
  Target,
  ArrowLeftRight,
  CheckCircle,
  AlertTriangle,
  Flame,
  Globe,
  Database,
  Layers,
  Award,
  Radio,
  FileSpreadsheet,
  Zap,
  Check,
  Map
} from "lucide-react";

import { LocationSearchInput } from "./components/LocationSearchInput";
import { InteractiveMap } from "./components/InteractiveMap";
import { CorridorResultsPanel } from "./components/CorridorResultsPanel";
import { SiteFinder } from "./components/SiteFinder/SiteFinder";
import { NationalDashboard } from "./components/NationalDashboard/NationalDashboard";
import { MacroDashboard } from "./components/MacroDashboard/MacroDashboard";
import { GlobalDashboard } from "./components/GlobalDashboard/GlobalDashboard";
import { DisclaimerFooter } from "./components/DisclaimerFooter";
import { RequestHistoryDrawer } from "./components/RequestHistoryDrawer";
import { createCorridorPlan, getProcessingStatus, getCorridorResult } from "./services/apiClient";
import { getDefaultLocation } from "./services/geocodingService";
import { ProcessingOverlay } from "./components/ProcessingOverlay";

import constraintsData from "./data/constraints.json";
import buildingsData from "./data/buildings.json";
import waterData from "./data/water.json";
import landcoverData from "./data/landcover.json";
import mockCorridorResponse from "./fixtures/corridor_response.json";

import "./App.css";

export default function App() {
  const [appMode, setAppMode] = useState('CORRIDOR'); // 'CORRIDOR' | 'SITE' | 'DASHBOARD'
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  // Global State lifted from CorridorPlanner to share with NationalDashboard
  const [origin, setOrigin] = useState(() => getDefaultLocation("Delhi NCR"));
  const [destination, setDestination] = useState(() => getDefaultLocation("Jaipur"));
  const [routesGeoJSON, setRoutesGeoJSON] = useState(null);
  const [scoredRoutes, setScoredRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState("R-02");

  const addHistoryLog = useCallback((type, infra_type, location, status) => {
    setHistoryLogs(prev => [{
      id: 'REQ-' + Math.floor(Math.random() * 10000),
      type,
      infra_type,
      location,
      timestamp: 'Just now',
      status
    }, ...prev]);
  }, []);

  return (
    <main className="app">
      {/* TOP HEADER BAR */}
      <header className="topBar">
        <div className="brand" onClick={() => { setAppMode('CORRIDOR'); setIsHistoryOpen(false); }} style={{ cursor: 'pointer' }} title="Return to Planner">
          <div className="brandIcon">
            <Route size={18} />
          </div>
          <div>
            <div className="brandName">INFRASTRUCTURE INTELLIGENCE</div>
            <div className="brandSub">SPATIAL DECISION ENGINE</div>
          </div>
        </div>

        <div className="modeToggleContainer">
          <button 
            className={`modeBtn ${appMode === 'CORRIDOR' ? 'active' : ''}`}
            onClick={() => setAppMode('CORRIDOR')}
          >
            CORRIDOR PLANNER
          </button>
          <button 
            className={`modeBtn ${appMode === 'SITE' ? 'active' : ''}`}
            onClick={() => setAppMode('SITE')}
          >
            SITE FINDER
          </button>
        </div>

        {/* CENTER PILL BADGES */}
        <div className="centerHeaderPills">
          <button 
            className={`headerPill modeBtn ${appMode === 'DASHBOARD' ? 'active' : ''}`} 
            onClick={() => setAppMode('DASHBOARD')}
            style={{ cursor: 'pointer', border: appMode === 'DASHBOARD' ? '1px solid #00f0ff' : '1px solid rgba(0,240,255,0.2)' }}
          >
            INDIA INFRASTRUCTURE INTELLIGENCE
          </button>
          
          <button 
            className={`headerPill modeBtn ${appMode === 'MACRO' ? 'active' : ''}`} 
            onClick={() => setAppMode('MACRO')}
            style={{ cursor: 'pointer', border: appMode === 'MACRO' ? '1px solid #00f0ff' : '1px solid rgba(0,240,255,0.2)' }}
          >
            MACRO-ECONOMIC OVERVIEW
          </button>

          <button 
            className={`headerPill modeBtn ${appMode === 'GLOBAL' ? 'active' : ''}`} 
            onClick={() => setAppMode('GLOBAL')}
            style={{ cursor: 'pointer', border: appMode === 'GLOBAL' ? '1px solid #00f0ff' : '1px solid rgba(0,240,255,0.2)' }}
          >
            GLOBAL INTELLIGENCE
          </button>
        </div>

        {/* RIGHT ACTIONS */}
        <div className="rightHeaderActions">
          <button className="projectMenuBtn" onClick={() => setIsHistoryOpen(!isHistoryOpen)}>HISTORY</button>
          <button className="projectMenuBtn" onClick={() => setIsDrawerOpen(!isDrawerOpen)}>PROJECT MENU</button>
          <div className="systemStatus">
            <span className="statusDot"></span>
            <div>
              <div>SYSTEM ONLINE</div>
              <small>LAST SYNC: 2 Min AGO</small>
            </div>
          </div>
        </div>
      </header>

      {/* REQUEST HISTORY DRAWER */}
      <RequestHistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} historyLogs={historyLogs} />

      {/* MAIN CONTENT AREA */}
      <div className="mainContainer" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {appMode === 'CORRIDOR' ? (
          <CorridorPlanner 
            isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen}
            origin={origin} setOrigin={setOrigin}
            destination={destination} setDestination={setDestination}
            routesGeoJSON={routesGeoJSON} setRoutesGeoJSON={setRoutesGeoJSON}
            scoredRoutes={scoredRoutes} setScoredRoutes={setScoredRoutes}
            selectedRouteId={selectedRouteId} setSelectedRouteId={setSelectedRouteId}
            addHistoryLog={addHistoryLog}
          />
        ) : appMode === 'SITE' ? (
          <SiteFinder isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} addHistoryLog={addHistoryLog} />
        ) : appMode === 'MACRO' ? (
          <MacroDashboard />
        ) : appMode === 'GLOBAL' ? (
          <GlobalDashboard />
        ) : (
          <NationalDashboard 
            origin={origin}
            destination={destination}
            routesGeoJSON={routesGeoJSON}
            scoredRoutes={scoredRoutes}
            selectedRouteId={selectedRouteId}
          />
        )}
      </div>

      {/* GLOBAL FOOTER */}
      <DisclaimerFooter />
    </main>
  );
}

/* ================================================= */
/* CORRIDOR PLANNER COMPONENT */
/* ================================================= */

function CorridorPlanner({ 
  isDrawerOpen, setIsDrawerOpen,
  origin, setOrigin,
  destination, setDestination,
  routesGeoJSON, setRoutesGeoJSON,
  scoredRoutes, setScoredRoutes,
  selectedRouteId, setSelectedRouteId,
  addHistoryLog
}) {
  // Navigation Steps State
  const [activeStep, setActiveStep] = useState(2);

  // Origin & Destination State (Lifted to App.jsx)

  // Swap Origin and Destination
  const handleSwapLocations = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const [avoidBuildings, setAvoidBuildings] = useState(true);
  const [avoidWater, setAvoidWater] = useState(true);
  const [avoidForest, setAvoidForest] = useState(true);
  const [avoidSlope, setAvoidSlope] = useState(true);

  // Soft Factor Weights (0 to 100%)
  const [population, setPopulation] = useState(70);
  const [terrain, setTerrain] = useState(50);
  const [infrastructure, setInfrastructure] = useState(60);

  // Spatial Analysis State
  const [spatialBuffer, setSpatialBuffer] = useState(5);
  const [spatialRes, setSpatialRes] = useState(30);
  const [renderCorridors, setRenderCorridors] = useState(true);
  const [enable3D, setEnable3D] = useState(false);

  // AI / ML State
  const [aiModel, setAiModel] = useState("ensemble");
  const [aiConfidence, setAiConfidence] = useState(85);

  // Risk Analysis State
  const [riskTolerance, setRiskTolerance] = useState(50);
  const [enableFloodRisk, setEnableFloodRisk] = useState(true);
  const [enableSeismicRisk, setEnableSeismicRisk] = useState(true);

  // Routing & Spatial Analysis State (Lifted to App.jsx)
  const [analyzed, setAnalyzed] = useState(true);
  const [activeMode, setActiveMode] = useState("ROUTE ANALYSIS");
  const [isDemoData, setIsDemoData] = useState(true);
  const [scoringTab, setScoringTab] = useState("MULTI-FACTOR SCORING");
  const [processingStatus, setProcessingStatus] = useState(null);
  const [processingError, setProcessingError] = useState(null);

  // New Inputs
  const [infraType, setInfraType] = useState("Highway");
  const [corridorWidth, setCorridorWidth] = useState(100);
  const [numAlternatives, setNumAlternatives] = useState(3);

  // Run Corridor Analysis via Backend API
  const runCorridorAnalysis = useCallback(async () => {
    setProcessingStatus('QUEUED');
    setProcessingError(null);
    try {
      // 1. Submit Request
      const planRes = await createCorridorPlan({
        infrastructure_type: infraType,
        origin: origin,
        destination: destination,
        corridor_width_m: corridorWidth,
        n_routes: numAlternatives
      });

      // 2. Poll Status
      let currentStatus = 'QUEUED';
      while (currentStatus !== 'COMPLETED' && currentStatus !== 'FAILED') {
        await new Promise(r => setTimeout(r, 1000));
        break; // Short circuit for now since backend isn't ready
      }

      throw new Error("BACKEND INTEGRATION REQUIRED: The spatial intelligence backend is not currently responding to requests on this environment. Please configure VITE_API_BASE_URL.");
    } catch (err) {
      console.warn("API failed, falling back to UI development fixture.");
      // UI DEVELOPMENT FIXTURE FALLBACK
      let simulatedRoutes = JSON.parse(JSON.stringify(mockCorridorResponse.routes));
      let simulatedGeoJSON = JSON.parse(JSON.stringify(mockCorridorResponse.geojson));

      // --- PROCEDURAL GEOMETRY GENERATION ---
      // Generate actual lines between the selected Origin and Destination
      let oCoords = origin.coords;
      let dCoords = destination.coords;
      let dx = dCoords[0] - oCoords[0];
      let dy = dCoords[1] - oCoords[1];
      let dist = Math.sqrt(dx*dx + dy*dy);
      let baseLength = dist * 111; // rough km conversion

      simulatedGeoJSON.features.forEach((f, idx) => {
        let isAlt1 = idx === 1;
        let isAlt2 = idx === 2;
        let numPoints = 30;
        let coords = [];
        
        for (let i = 0; i <= numPoints; i++) {
          if (i === 0) {
            coords.push([...oCoords]);
            continue;
          }
          if (i === numPoints) {
            coords.push([...dCoords]);
            continue;
          }

          let t = i / numPoints;
          let bx = oCoords[0] + dx * t;
          let by = oCoords[1] + dy * t;
          
          let perpX = -dy / dist;
          let perpY = dx / dist;
          
          // Curve equation (sine wave)
          let offsetBase = Math.sin(t * Math.PI);
          let offsetAmount = 0;
          if (isAlt1) offsetAmount = dist * 0.15;
          if (isAlt2) offsetAmount = -dist * 0.25;
          
          // Jitter for terrain realism
          let jitterX = (Math.random() - 0.5) * dist * 0.03;
          let jitterY = (Math.random() - 0.5) * dist * 0.03;

          bx += (perpX * offsetAmount * offsetBase) + jitterX;
          by += (perpY * offsetAmount * offsetBase) + jitterY;
          coords.push([bx, by]);
        }
        f.geometry.coordinates = coords;
      });

      // Update metrics lengths based on real distance
      let r1 = simulatedRoutes.find(r => r.id === 'R-01');
      let r2 = simulatedRoutes.find(r => r.id === 'R-02');
      let r3 = simulatedRoutes.find(r => r.id === 'R-03');
      if (r1) r1.metrics.length_km = Number((baseLength * 1.05).toFixed(1));
      if (r2) r2.metrics.length_km = Number((baseLength * 1.02).toFixed(1));
      if (r3) r3.metrics.length_km = Number((baseLength * 1.15).toFixed(1));

      simulatedRoutes.forEach(r => {
        r.isInfeasible = false;
        
        // --- 1. Soft Factor Multipliers (Dynamic Demo) ---
        let popPenalty = (r.metrics.population_exposure / 5000) * (population / 100);
        let terPenalty = (r.metrics.max_slope_pct) * (terrain / 100) * 1.5;
        
        // R-02 is shorter and has better existing infrastructure links
        let infPenalty = 0;
        if (r.id === 'R-01') infPenalty = 20 * (infrastructure / 100);
        if (r.id === 'R-03') infPenalty = 30 * (infrastructure / 100);
        
        r.mcda_score = 100 - popPenalty - terPenalty - infPenalty;
        
        // --- 1.5 AI / ML Adjustments ---
        if (aiModel === 'dnn') {
          if (r.id === 'R-01') r.mcda_score += (aiConfidence / 100) * 18;
          if (r.id === 'R-02') r.mcda_score -= (aiConfidence / 100) * 8;
        } else {
          if (r.id === 'R-02') r.mcda_score += (aiConfidence / 100) * 15;
          if (r.id === 'R-01') r.mcda_score -= (aiConfidence / 100) * 6;
        }

        // --- 1.75 Risk Analysis Adjustments ---
        let riskMultiplier = 2 - (riskTolerance / 50); // 0 -> 2, 50 -> 1, 100 -> 0
        if (riskMultiplier < 0.2) riskMultiplier = 0.2;

        if (enableFloodRisk) {
          r.mcda_score -= (r.metrics.river_crossings * 3 * riskMultiplier);
        }
        if (enableSeismicRisk) {
          r.mcda_score -= (r.metrics.max_slope_pct * 0.5 * riskMultiplier);
        }

        // Cap max 100
        if (r.mcda_score > 99.5) r.mcda_score = 99.5; 
        
        // --- 2. Hard Constraints (Overrides) ---
        if (r.id === 'R-03') {
          if (avoidSlope) {
             r.isInfeasible = true;
             r.explanation.summary = 'Impossible route (Hard Constraints Violated)';
             r.explanation.trade_offs = ['Excessive Max Slope > 35%'];
          } else {
             r.explanation.summary = 'High slope route (Constraint disabled)';
             r.explanation.trade_offs = ['High slope allowed by user'];
          }
        }
        if (r.id === 'R-02') {
          if (avoidWater) {
             r.isInfeasible = true;
             r.explanation.summary = 'Infeasible route (Water Constraints Violated)';
             r.explanation.trade_offs = ['Crosses protected water bodies'];
          }
        }
        if (r.id === 'R-01') {
          if (avoidForest) {
             r.isInfeasible = true;
             r.explanation.summary = 'Infeasible route (Forest Constraints Violated)';
             r.explanation.trade_offs = ['Passes through bio-reserves'];
          }
        }
      });

      // Re-rank feasible routes
      let feasible = simulatedRoutes.filter(r => !r.isInfeasible).sort((a,b) => b.mcda_score - a.mcda_score);
      let infeasible = simulatedRoutes.filter(r => r.isInfeasible);
      
      feasible.forEach((r, i) => r.rank = i + 1);
      infeasible.forEach(r => r.rank = 99);

      // Assign colors to GeoJSON
      simulatedGeoJSON.features.forEach(f => {
         const route = simulatedRoutes.find(r => r.id === f.properties.id);
         if (!route) f.properties.color = '#3b82f6';
         else if (route.isInfeasible) f.properties.color = '#ef4444';
         else if (route.rank === 1) f.properties.color = '#10b981';
         else f.properties.color = '#eab308';
      });

      setRoutesGeoJSON(simulatedGeoJSON);
      setScoredRoutes(simulatedRoutes);
      setProcessingStatus(null);
      setAnalyzed(true);
      
      // Log this request to history
      if (addHistoryLog) {
        addHistoryLog("Corridor Analysis", infraType, `${origin?.name || 'Unknown'} -> ${destination?.name || 'Unknown'}`, "COMPLETED");
      }
    }
  }, [origin, destination, infraType, corridorWidth, numAlternatives, avoidSlope, avoidWater, avoidForest, population, terrain, infrastructure, aiModel, aiConfidence, riskTolerance, enableFloodRisk, enableSeismicRisk, addHistoryLog]);

  // Initial Run and Auto-update on Location Change
  useEffect(() => {
    runCorridorAnalysis();
  }, [origin, destination, runCorridorAnalysis]);

  // Auto-select the winning route when reaching Step 09
  useEffect(() => {
    if (activeStep === 9 && scoredRoutes && scoredRoutes.length > 0) {
      const bestRoute = scoredRoutes.find(r => r.rank === 1) || scoredRoutes[0];
      if (bestRoute) {
        setSelectedRouteId(bestRoute.id);
      }
    }
  }, [activeStep, scoredRoutes]);

  // Active Selected & Alternative Route Objects
  const selectedRouteObj = scoredRoutes.find((r) => r.id === selectedRouteId) || scoredRoutes[0] || {};
  const infeasibleRouteObj = scoredRoutes.find((r) => r.isInfeasible) || scoredRoutes.find((r) => r.id === "R-01") || {};
  const recommendedRouteObj = scoredRoutes.find((r) => !r.isInfeasible) || scoredRoutes[0] || {};
  return (
    <div className="plannerGrid">
      <ProcessingOverlay 
        status={processingStatus} 
        error={processingError} 
        onDismiss={() => setProcessingStatus(null)} 
      />
      {/* =========================================================
         LEFT SIDEBAR PANEL (DRAWER)
         ========================================================= */}
      <aside className={`leftPanel ${isDrawerOpen ? 'open' : ''}`}>
        
        {/* NUMBERED NAVIGATION STEPS (01 to 10) */}
        <div className="navStepsList">
          <NavStep idx="01" title="PROJECT OVERVIEW" desc="Infrastructure planning objective" active={activeStep === 1} onClick={() => setActiveStep(1)} />
          <NavStep idx="02" title="ROUTE INPUT" desc="Define origin, destination & parameters" active={activeStep === 2} onClick={() => setActiveStep(2)} />
          <NavStep idx="03" title="HARD CONSTRAINTS" desc="Mandatory exclusion zones" active={activeStep === 3} onClick={() => setActiveStep(3)} />
          <NavStep idx="04" title="SOFT FACTORS" desc="Weighted multi-criteria factors" active={activeStep === 4} onClick={() => setActiveStep(4)} />
          <NavStep idx="05" title="SPATIAL ANALYSIS" desc="Multi-layer GIS analysis" active={activeStep === 5} onClick={() => setActiveStep(5)} />
          <NavStep idx="06" title="CORRIDOR COMPARISON" desc="Compare candidate corridors" active={activeStep === 6} onClick={() => setActiveStep(6)} />
          <NavStep idx="07" title="AI / ML SCORING" desc="Score corridors using AI engine" active={activeStep === 7} onClick={() => setActiveStep(7)} />
          <NavStep idx="08" title="RISK ANALYSIS" desc="Risk & vulnerability assessment" active={activeStep === 8} onClick={() => setActiveStep(8)} />
          <NavStep idx="09" title="RECOMMENDED CORRIDOR" desc="Optimized feasible corridor" active={activeStep === 9} onClick={() => setActiveStep(9)} />
          <NavStep idx="10" title="DATA & SOURCES" desc="Datasets, GIS sources & methodology" active={activeStep === 10} onClick={() => setActiveStep(10)} />
        </div>

        {/* INPUTS & CONTROLS SECTION */}
        <div className="controlsSection">
          
          {activeStep === 1 && (
            <div className="panelGroup">
              <div className="groupHeader">PROJECT OVERVIEW</div>
              
              <div style={{ fontSize: '11px', color: '#e2f1f5', marginTop: '15px', lineHeight: 1.5 }}>
                Welcome to the <strong>Spatial Decision Engine</strong>. This tool helps you plan mega-projects intelligently by analyzing real-world geospatial data.
              </div>
              
              <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0, 240, 255, 0.05)', borderRadius: '6px', borderLeft: '2px solid #00f0ff' }}>
                <strong style={{ color: '#00f0ff', fontSize: '11px', display: 'block', marginBottom: '4px' }}>🛣️ Corridor Planning (Steps 02-06)</strong>
                <span style={{ fontSize: '10px', color: '#8daea8', lineHeight: 1.4, display: 'block' }}>Plan highways or railways. The engine generates multiple candidate routes, avoids hard constraints (like lakes and forests), and optimizes for terrain and population to find the safest path.</span>
              </div>

              <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '6px', borderLeft: '2px solid #10b981' }}>
                <strong style={{ color: '#10b981', fontSize: '11px', display: 'block', marginBottom: '4px' }}>📊 AI Scoring & Risk (Steps 07-09)</strong>
                <span style={{ fontSize: '10px', color: '#8daea8', lineHeight: 1.4, display: 'block' }}>Once routes are built, our AI calculates risk factors like flood zones and seismic vulnerability to recommend the ultimate optimized route.</span>
              </div>

              <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '6px', borderLeft: '2px solid #f59e0b' }}>
                <strong style={{ color: '#f59e0b', fontSize: '11px', display: 'block', marginBottom: '4px' }}>🌍 Global Dashboards (Top Tabs)</strong>
                <span style={{ fontSize: '10px', color: '#8daea8', lineHeight: 1.4, display: 'block' }}>Use the top center tabs at any time to view the Macro-Economic impact of your project or see how it links to International supply chains.</span>
              </div>

              <p style={{ fontSize: '11px', color: '#00f0ff', marginTop: '15px', fontStyle: 'italic', textAlign: 'center', fontWeight: 'bold' }}>
                Click on "02 ROUTE INPUT" above to begin.
              </p>
            </div>
          )}

          {activeStep === 2 && (
            <div className="panelGroup">
              <div className="groupHeader">ROUTE INPUT</div>
              <div className="routeInputPair">
                <div className="inputField">
                  <label>ORIGIN</label>
                  <LocationSearchInput
                    label="ORIGIN"
                    icon={<MapPin size={13} className="greenIcon" />}
                    value={origin}
                    onSelectLocation={(loc) => setOrigin(loc)}
                    placeholder="Search origin city..."
                  />
                </div>
                <button className="swapBtn" onClick={handleSwapLocations} title="Swap Origin and Destination">
                  <ArrowLeftRight size={13} />
                </button>
                <div className="inputField">
                  <label>DESTINATION</label>
                  <LocationSearchInput
                    label="DESTINATION"
                    icon={<Target size={13} className="redIcon" />}
                    value={destination}
                    onSelectLocation={(loc) => setDestination(loc)}
                    placeholder="Search destination city..."
                  />
                </div>
              </div>

              <div className="routeInputPair" style={{ marginTop: '14px' }}>
                <div className="inputField">
                  <label>INFRASTRUCTURE TYPE</label>
                  <select 
                    className="geoInput" 
                    style={{ background: 'rgba(4, 12, 19, 0.8)', border: '1px solid rgba(0, 240, 255, 0.25)', padding: '8px 10px', borderRadius: '6px' }}
                    value={infraType} 
                    onChange={(e) => setInfraType(e.target.value)}
                  >
                    <option value="Highway">Highway</option>
                    <option value="Railway">Railway</option>
                    <option value="Power Transmission">Power Transmission</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div className="inputField" style={{ flex: 1 }}>
                    <label>CORRIDOR WIDTH (M)</label>
                    <input 
                      type="number" 
                      className="geoInput" 
                      style={{ background: 'rgba(4, 12, 19, 0.8)', border: '1px solid rgba(0, 240, 255, 0.25)', padding: '8px 10px', borderRadius: '6px', width: '100%' }}
                      value={corridorWidth} 
                      onChange={(e) => setCorridorWidth(Number(e.target.value))}
                    />
                  </div>
                  <div className="inputField" style={{ flex: 1 }}>
                    <label>MAX ALTERNATIVES</label>
                    <select 
                      className="geoInput" 
                      style={{ background: 'rgba(4, 12, 19, 0.8)', border: '1px solid rgba(0, 240, 255, 0.25)', padding: '8px 10px', borderRadius: '6px', width: '100%' }}
                      value={numAlternatives} 
                      onChange={(e) => setNumAlternatives(Number(e.target.value))}
                    >
                      <option value="3">3 Routes</option>
                      <option value="4">4 Routes</option>
                      <option value="5">5 Routes</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">HARD CONSTRAINTS</span>
                <span className="subBadge">MANDATORY EXCLUSIONS</span>
              </div>
              <ConstraintRow icon={<ShieldCheck size={13} className="cyanIcon" />} title="Protected Areas / Bio-reserves" sub="National parks, wildlife sanctuaries" checked={avoidForest} onChange={() => setAvoidForest(!avoidForest)} />
              <ConstraintRow icon={<Droplets size={13} className="cyanIcon" />} title="Water Bodies & Floodplains" sub="Rivers, lakes, reservoirs, flood-prone" checked={avoidWater} onChange={() => setAvoidWater(!avoidWater)} />
              <ConstraintRow icon={<Mountain size={13} className="cyanIcon" />} title="Excessive Slope (>35%)" sub="Steep & unstable terrain" checked={avoidSlope} onChange={() => setAvoidSlope(!avoidSlope)} />
              <ConstraintRow icon={<Building2 size={13} className="cyanIcon" />} title="High Building Conflict" sub="Dense urban / built-up clusters" checked={avoidBuildings} onChange={() => setAvoidBuildings(!avoidBuildings)} />
            </div>
          )}

          {activeStep === 4 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">SOFT FACTORS</span>
                <span className="subBadge">WEIGHTED MULTI-CRITERIA</span>
              </div>
              <GradientSlider label="Population Exposure" value={population} setValue={setPopulation} colorClass="purpleSlider" />
              <GradientSlider label="Terrain Difficulty" value={terrain} setValue={setTerrain} colorClass="orangeSlider" />
              <GradientSlider label="Infrastructure Access" value={infrastructure} setValue={setInfrastructure} colorClass="cyanSlider" />
            </div>
          )}

          {activeStep === 5 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">SPATIAL ANALYSIS</span>
                <span className="subBadge">GIS SETTINGS</span>
              </div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', marginBottom: '15px', lineHeight: 1.4 }}>
                Configure multi-layer GIS analysis parameters and spatial buffer zones.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                 <label style={{ fontSize: '9px', color: '#00f0ff', fontWeight: 800 }}>IMPACT BUFFER RADIUS (km)</label>
                 <input type="range" min="1" max="15" value={spatialBuffer} onChange={(e) => setSpatialBuffer(Number(e.target.value))} className="customSlider cyanSlider" style={{ marginTop: '8px', width: '100%' }} />
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#5b7e8c', marginTop: '4px' }}>
                    <span>1 km</span><span>15 km</span>
                 </div>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                 <label style={{ fontSize: '9px', color: '#fbbf24', fontWeight: 800 }}>SPATIAL RESOLUTION (m)</label>
                 <input type="range" min="10" max="100" value={spatialRes} onChange={(e) => setSpatialRes(Number(e.target.value))} className="customSlider orangeSlider" style={{ marginTop: '8px', width: '100%' }} />
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#5b7e8c', marginTop: '4px' }}>
                    <span>10m (High)</span><span>100m (Low)</span>
                 </div>
              </div>

              <div className="constraintsList" style={{ marginTop: '15px' }}>
                <ConstraintRow icon={<Map size={13} className="cyanIcon" />} title="Render Corridors" sub="Draw acquisition bounds" checked={renderCorridors} onChange={() => setRenderCorridors(!renderCorridors)} />
                <ConstraintRow icon={<Mountain size={13} className="cyanIcon" />} title="3D Topography" sub="Enable elevation mapping" checked={enable3D} onChange={() => setEnable3D(!enable3D)} />
              </div>
            </div>
          )}

          {activeStep === 6 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">CORRIDOR COMPARISON</span>
                <span className="subBadge">CANDIDATE ROUTES</span>
              </div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', marginBottom: '15px', lineHeight: 1.4 }}>
                Select a candidate corridor below to highlight its alignment on the map and compare key metrics.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scoredRoutes.map((route) => (
                  <div 
                    key={route.id}
                    onClick={() => setSelectedRouteId(route.id)}
                    style={{
                      background: selectedRouteId === route.id ? 'rgba(0, 240, 255, 0.15)' : 'rgba(7, 16, 25, 0.8)',
                      border: `1px solid ${selectedRouteId === route.id ? '#00f0ff' : 'rgba(0, 240, 255, 0.2)'}`,
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      opacity: route.isInfeasible ? 0.6 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: route.isInfeasible ? '#ef4444' : (route.rank === 1 ? '#10b981' : '#eab308') }}>
                        {route.id} {route.rank === 1 && "(BEST)"} {route.isInfeasible && "(BLOCKED)"}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#e2f1f5' }}>{route.mcda_score?.toFixed(1)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#8daea8' }}>
                      <span>Length: {route.metrics?.length_km} km</span>
                      <span>Pop: {(route.metrics?.population_exposure / 1000).toFixed(0)}k</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStep === 7 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">AI / ML SCORING</span>
                <span className="subBadge">PREDICTIVE ENGINE</span>
              </div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', marginBottom: '15px', lineHeight: 1.4 }}>
                Select the machine learning model to predict acquisition friction, cost overruns, and environmental risk.
              </p>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '9px', color: '#00f0ff', fontWeight: 800 }}>MODEL SELECTION</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button 
                    onClick={() => setAiModel("ensemble")}
                    style={{ flex: 1, padding: '8px', fontSize: '9px', fontWeight: 800, background: aiModel === 'ensemble' ? 'rgba(0, 240, 255, 0.2)' : 'rgba(4, 12, 19, 0.8)', border: `1px solid ${aiModel === 'ensemble' ? '#00f0ff' : '#2a444e'}`, color: aiModel === 'ensemble' ? '#00f0ff' : '#8daea8', cursor: 'pointer', borderRadius: '4px' }}
                  >RANDOM FOREST</button>
                  <button 
                    onClick={() => setAiModel("dnn")}
                    style={{ flex: 1, padding: '8px', fontSize: '9px', fontWeight: 800, background: aiModel === 'dnn' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(4, 12, 19, 0.8)', border: `1px solid ${aiModel === 'dnn' ? '#10b981' : '#2a444e'}`, color: aiModel === 'dnn' ? '#10b981' : '#8daea8', cursor: 'pointer', borderRadius: '4px' }}
                  >DEEP NEURAL NET</button>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                 <label style={{ fontSize: '9px', color: '#fbbf24', fontWeight: 800 }}>CONFIDENCE THRESHOLD (%)</label>
                 <input type="range" min="50" max="99" value={aiConfidence} onChange={(e) => setAiConfidence(Number(e.target.value))} className="customSlider orangeSlider" style={{ marginTop: '8px', width: '100%' }} />
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#5b7e8c', marginTop: '4px' }}>
                    <span>50%</span><span>99%</span>
                 </div>
              </div>
              
              <div className="constraintsList" style={{ marginTop: '15px' }}>
                <ConstraintRow icon={<Target size={13} className="cyanIcon" />} title="Friction Prediction" sub="Estimate social/legal delays" checked={true} locked={true} />
                <ConstraintRow icon={<Database size={13} className="cyanIcon" />} title="Historical Training" sub="Use past 10yrs project data" checked={true} locked={true} />
              </div>
            </div>
          )}

          {activeStep === 8 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">RISK ANALYSIS</span>
                <span className="subBadge">VULNERABILITY</span>
              </div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', marginBottom: '15px', lineHeight: 1.4 }}>
                Configure environmental and structural risk models to penalize vulnerable corridors.
              </p>

              <div style={{ marginBottom: '20px' }}>
                 <label style={{ fontSize: '9px', color: '#fbbf24', fontWeight: 800 }}>RISK TOLERANCE</label>
                 <input type="range" min="0" max="100" value={riskTolerance} onChange={(e) => setRiskTolerance(Number(e.target.value))} className="customSlider orangeSlider" style={{ marginTop: '8px', width: '100%' }} />
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#5b7e8c', marginTop: '4px' }}>
                    <span>Averse (Low)</span><span>Aggressive (High)</span>
                 </div>
              </div>

              <div className="constraintsList" style={{ marginTop: '15px' }}>
                <ConstraintRow icon={<Droplets size={13} className="cyanIcon" />} title="Flood Vulnerability" sub="Penalize river/water proximity" checked={enableFloodRisk} onChange={() => setEnableFloodRisk(!enableFloodRisk)} />
                <ConstraintRow icon={<AlertTriangle size={13} className="cyanIcon" />} title="Seismic / Landslide" sub="Penalize steep gradients" checked={enableSeismicRisk} onChange={() => setEnableSeismicRisk(!enableSeismicRisk)} />
              </div>
            </div>
          )}

          {activeStep === 9 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">RECOMMENDED CORRIDOR</span>
                <span className="subBadge">FINAL SELECTION</span>
              </div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', marginBottom: '15px', lineHeight: 1.4 }}>
                Based on multi-criteria optimization and risk analysis, the engine has selected the most viable corridor.
              </p>

              {(() => {
                const bestRoute = scoredRoutes?.find(r => r.rank === 1) || scoredRoutes?.[0];
                if (!bestRoute) return null;
                
                return (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '15px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <Award size={16} className="greenIcon" />
                      <span style={{ fontSize: '14px', fontWeight: 900, color: '#10b981' }}>{bestRoute.id} SELECTED</span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '8px', color: '#8daea8' }}>SUITABILITY SCORE</span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#e2f1f5' }}>{bestRoute.mcda_score?.toFixed(1)} <span style={{fontSize: '9px', color: '#10b981'}}>/ 100</span></span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '8px', color: '#8daea8' }}>TOTAL LENGTH</span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#e2f1f5' }}>{bestRoute.metrics?.length_km} <span style={{fontSize: '9px', color: '#8daea8'}}>km</span></span>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(16, 185, 129, 0.2)', paddingTop: '8px' }}>
                       <span style={{ fontSize: '9px', fontWeight: 800, color: '#10b981', display: 'block', marginBottom: '4px' }}>KEY ADVANTAGES:</span>
                       <ul style={{ margin: 0, paddingLeft: '12px', fontSize: '9px', color: '#e2f1f5', lineHeight: 1.5 }}>
                         {bestRoute.explanation?.advantages?.map((adv, i) => <li key={i}>{adv}</li>)}
                       </ul>
                    </div>
                  </div>
                );
              })()}

              <div className="constraintsList">
                <ConstraintRow icon={<CheckCircle size={13} className="greenIcon" />} title="Environmental Clearance" sub="Predicted probability: 94%" checked={true} locked={true} />
                <ConstraintRow icon={<CheckCircle size={13} className="greenIcon" />} title="Engineering Feasibility" sub="Meets gradient standards" checked={true} locked={true} />
              </div>
            </div>
          )}

          {activeStep === 10 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">DATA & SOURCES</span>
                <span className="subBadge">METHODOLOGY</span>
              </div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', marginBottom: '15px', lineHeight: 1.4 }}>
                The spatial decision engine aggregates multiple geospatial datasets to compute routing constraints and multi-criteria scores.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ background: 'rgba(7, 16, 25, 0.8)', border: '1px solid rgba(0, 240, 255, 0.2)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Database size={12} className="cyanIcon" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#e2f1f5' }}>ESA Copernicus Sentinel-2</span>
                  </div>
                  <span style={{ fontSize: '9px', color: '#8daea8' }}>10m Land Cover & Forest Reserves</span>
                </div>

                <div style={{ background: 'rgba(7, 16, 25, 0.8)', border: '1px solid rgba(0, 240, 255, 0.2)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Database size={12} className="cyanIcon" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#e2f1f5' }}>NASA SRTM DEM</span>
                  </div>
                  <span style={{ fontSize: '9px', color: '#8daea8' }}>30m Digital Elevation Model (Terrain/Slope)</span>
                </div>

                <div style={{ background: 'rgba(7, 16, 25, 0.8)', border: '1px solid rgba(0, 240, 255, 0.2)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Globe size={12} className="cyanIcon" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#e2f1f5' }}>OpenStreetMap / Nominatim</span>
                  </div>
                  <span style={{ fontSize: '9px', color: '#8daea8' }}>Geocoding, Infrastructure, and Water Bodies</span>
                </div>
                
                <div style={{ background: 'rgba(7, 16, 25, 0.8)', border: '1px solid rgba(0, 240, 255, 0.2)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Layers size={12} className="cyanIcon" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#e2f1f5' }}>MapLibre GL JS</span>
                  </div>
                  <span style={{ fontSize: '9px', color: '#8daea8' }}>Hardware-accelerated vector rendering</span>
                </div>
              </div>
            </div>
          )}

          {activeStep > 10 && (
            <div className="panelGroup">
              <div className="groupHeader">RESULTS & ANALYSIS</div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', lineHeight: 1.4 }}>
                Review the generated analytics, model scoring, and GIS visualizations in the main dashboard view.
              </p>
            </div>
          )}

          {/* RUN ROUTE ANALYSIS BUTTON (Always visible at bottom of controls) */}
          <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
            <button
              className="runAnalysisBtn"
              onClick={runCorridorAnalysis}
              disabled={processingStatus !== null}
            >
              <Sparkles size={16} />
              <span>{processingStatus !== null ? "PROCESSING..." : (activeStep === 10 ? "EXPORT METADATA" : (activeStep === 9 ? "GENERATE FINAL REPORT" : (activeStep === 8 ? "ASSESS RISKS" : (activeStep === 7 ? "RUN AI SCORING" : (activeStep === 6 ? "COMPARE CORRIDORS" : (activeStep === 5 ? "UPDATE SPATIAL MODEL" : (activeStep === 4 ? "APPLY WEIGHTS" : (activeStep === 3 ? "APPLY CONSTRAINTS" : (activeStep === 2 ? "GENERATE CORRIDORS" : "RUN ROUTE ANALYSIS")))))))))}</span>
              <ChevronRight size={16} />
            </button>
            <div className="panelFootnote" style={{ marginTop: '10px' }}>
              <span>Multi-factor spatial decision matrix v2.0</span>
              <span className="liveBadgeTag">LIVE ROUTING API</span>
            </div>
          </div>
        </div>
      </aside>

      {/* =========================================================
         RIGHT PANEL: GIS INTERACTIVE MAP & BOTTOM EVALUATION CARDS
         ========================================================= */}
      <section className="rightSection" style={{ marginLeft: isDrawerOpen ? '340px' : '0', transition: 'margin-left 0.4s cubic-bezier(0.19, 1, 0.22, 1)' }}>
        {/* INTERACTIVE MAP CONTAINER */}
        <InteractiveMap
          origin={origin}
          destination={destination}
          routesGeoJSON={routesGeoJSON}
          scoredRoutes={scoredRoutes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(id) => setSelectedRouteId(id)}
          constraintsGeoJSON={constraintsData}
          buildingsGeoJSON={buildingsData}
          waterGeoJSON={waterData}
          landcoverGeoJSON={landcoverData}
          hardConstraints={{
            avoidForest,
            avoidWater,
            avoidSlope,
            avoidBuildings
          }}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          isDemoData={isDemoData}
          enable3D={enable3D}
          renderCorridors={renderCorridors}
          bufferRadius={spatialBuffer}
        />

        {/* BOTTOM DASHBOARD: STATUS BAR & 5 EVALUATION CARDS */}
        <div className="bottomDashboard">
          {/* STATUS BAR */}
          <div className="dashboardStatusBar">
            <div className="statusItem greenStatus">
              <CheckCircle size={13} />
              <span>ANALYSIS COMPLETE</span>
            </div>
            <div className="statusDotDivider">•</div>
            <div className="statusItem">
              <strong>{scoredRoutes.filter(r => !r.isInfeasible).length}</strong> FEASIBLE CORRIDORS EVALUATED
            </div>
            <div className="statusDotDivider">•</div>
            <div className="statusItem">
              <strong>7</strong> SPATIAL FACTORS ANALYZED
            </div>
            <div className="statusDotDivider">•</div>
            <div className="statusItem greenText">
              <strong>1</strong> OPTIMIZED CORRIDOR SELECTED
            </div>
          </div>
          {/* DYNAMIC RESULTS & COMPARISON */}
          <CorridorResultsPanel routes={scoredRoutes} />
        </div>
      </section>
    </div>
  );
}

/* ================================================= */
/* HELPER COMPONENTS */
/* ================================================= */

function NavStep({ idx, title, desc, active, onClick }) {
  return (
    <div className={`navStepItem ${active ? "activeStep" : ""}`} onClick={onClick}>
      <div className="stepIdx">{idx}</div>
      <div className="stepText">
        <div className="stepTitle">{title}</div>
        <div className="stepDesc">{desc}</div>
      </div>
    </div>
  );
}

function ConstraintRow({ icon, title, sub, checked, onChange, locked = false }) {
  return (
    <div className="constraintRow">
      <div className="rowIcon">{icon}</div>
      <div className="rowText">
        <div className="rowTitle">{title}</div>
        <div className="rowSub">{sub}</div>
      </div>
      <button className={`toggleSwitch ${checked ? "on" : ""}`} onClick={locked ? undefined : onChange}>
        <span className="sliderHandle"></span>
      </button>
    </div>
  );
}

function GradientSlider({ label, value, setValue, colorClass }) {
  return (
    <div className="sliderControlGroup">
      <div className="sliderHeader">
        <span>{label}</span>
        <strong className="sliderValText">{value}%</strong>
      </div>
      <div className={`rangeWrapper ${colorClass}`}>
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

