import { useState, useCallback } from "react";
import {
  History, Folder, Activity, User, ArrowUpDown, Play,
  Code, FileSpreadsheet, MapPin, X, CircleDot, ChevronDown, ChevronUp,
  Mountain, Trees, Users, Home, Waves, Ruler, Scale, Sparkles, CheckCircle2, ShieldAlert,
  Navigation, ChevronRight, Check
} from "lucide-react";

import { InteractiveMap, ROUTE_COLORS } from "./components/InteractiveMap";
import { SiteFinder } from "./components/SiteFinder/SiteFinder";
import { NationalDashboard } from "./components/NationalDashboard/NationalDashboard";
import { MacroDashboard } from "./components/MacroDashboard/MacroDashboard";
import { GlobalDashboard } from "./components/GlobalDashboard/GlobalDashboard";
import { RequestHistoryDrawer } from "./components/RequestHistoryDrawer";
import { ProjectIntelligenceMenu } from "./components/ProjectIntelligenceMenu";
import { UserProfileModal } from "./components/UserProfileModal";
import { ProcessingOverlay } from "./components/ProcessingOverlay";
import { LocationSearchInput } from "./components/LocationSearchInput";
import { createCorridorPlan } from "./services/apiClient";
import { mapInfraClassToType, mapUiWeightsToMcda, normalizeCorridorResponse } from "./services/spatialAnalysisService";
import { useAuth } from "./context/AuthContext";

import "./App.css";

const METRIC_CONFIG = {
  forest_overlap_km2: { label: "Forest Disruption", unit: "km²", icon: Trees, category: "environment", isOptimalZero: true },
  cropland_overlap_km2: { label: "Cropland Disruption", unit: "km²", icon: Trees, category: "environment" },
  river_crossings: { label: "River Intersections", unit: "crossings", icon: Waves, category: "environment" },
  water_cell_overlap: { label: "Water Bodies Overlap", unit: "cells", icon: Waves, category: "environment" },
  population_exposure: { label: "Population Impacted", unit: "people", icon: Users, category: "social" },
  building_count: { label: "Buildings Affected", unit: "structures", icon: Home, category: "social", isOptimalZero: true },
  acquisition_friction_index: { label: "Land Acquisition Friction", unit: "/ 1.0", icon: Scale, category: "social" },
  mean_slope_deg: { label: "Mean Gradient", unit: "°", icon: Mountain, category: "terrain" },
  max_slope_deg: { label: "Max Gradient", unit: "°", icon: Mountain, category: "terrain" },
  route_length_km: { label: "Alignment Length", unit: "km", icon: Ruler, category: "engineering" },
  dist_to_highway_m: { label: "Highway Proximity", unit: "m", icon: Ruler, category: "engineering" },
};

export default function App() {
  const { session, signOut } = useAuth();

  const [appMode, setAppMode] = useState('CORRIDOR');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(true);

  const [origin, setOrigin] = useState({ name: "Latur", coords: [76.5726, 18.4088] });
  const [destination, setDestination] = useState({ name: "Osmanabad", coords: [76.0395, 18.1814] });

  const [infraClass, setInfraClass] = useState("Expressway (6-Lane)");
  const [corridorWidthM, setCorridorWidthM] = useState(500);
  const [nRoutes, setNRoutes] = useState(3);

  const [terrainWeight, setTerrainWeight] = useState(40);
  const [landCostWeight, setLandCostWeight] = useState(35);
  const [ecologicalWeight, setEcologicalWeight] = useState(25);

  const [routesGeoJSON, setRoutesGeoJSON] = useState(null);
  const [scoredRoutes, setScoredRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  const [processingStatus, setProcessingStatus] = useState(null);
  const [processingError, setProcessingError] = useState(null);

  const isAoiComplete = Boolean(origin?.coords && destination?.coords);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleSwapTerminals = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const runSpatialAnalysis = useCallback(async () => {
    if (!origin?.coords || !destination?.coords) {
      setProcessingError("Select an origin and destination first.");
      setProcessingStatus('FAILED');
      return;
    }
    setProcessingStatus('PROCESSING');
    setProcessingError(null);

    try {
      const payload = {
        infrastructure_type: mapInfraClassToType(infraClass),
        origin: { name: origin.name, lon: origin.coords[0], lat: origin.coords[1] },
        destination: { name: destination.name, lon: destination.coords[0], lat: destination.coords[1] },
        corridor_width_m: corridorWidthM,
        n_routes: nRoutes,
        mcda_weights: mapUiWeightsToMcda({ terrain: terrainWeight, landCost: landCostWeight, ecological: ecologicalWeight }),
      };

      // Pass session so backend can verify JWT and save analysis under this user
      const data = await createCorridorPlan(payload, session);
      const { geojson, scoredRoutes: scored } = normalizeCorridorResponse(data);

      setRoutesGeoJSON(geojson);
      setScoredRoutes(scored);
      if (scored.length > 0) setSelectedRouteId(scored[0].id);

      setProcessingStatus('COMPLETED');
      setTimeout(() => setProcessingStatus(null), 1200);
    } catch (err) {
      if (err.code === 'SESSION_EXPIRED') {
        setProcessingError("Session expired. Please sign in again.");
        setTimeout(() => signOut(), 2000);
      } else if (err.code === 'AUTH_ERROR') {
        setProcessingError(err.message || "Authentication error. Please try again.");
      } else {
        setProcessingError(err.message || "Analysis failed.");
      }
      setProcessingStatus('FAILED');
    }
  }, [origin, destination, infraClass, corridorWidthM, nRoutes, terrainWeight, landCostWeight, ecologicalWeight, session, signOut]);

  const selectedRoute = scoredRoutes.find(r => r.id === selectedRouteId) || scoredRoutes[0] || null;

  const handleExportGeoJSON = () => {
    if (!routesGeoJSON) return;
    downloadBlob(JSON.stringify(routesGeoJSON, null, 2), `InfraDrishti_Corridors_${Date.now()}.geojson`, "application/json");
  };

  const handleExportCSV = () => {
    if (!scoredRoutes || scoredRoutes.length === 0) return;
    const header = "ID,Rank,MCDA_Score,Length_km,Population_Exposure,Building_Cells,Forest_km2,AFI,Mean_Slope\n";
    const rows = scoredRoutes.map(r =>
      `${r.id},${r.rank},${r.scoreRaw},${r.metrics?.route_length_km ?? ""},${r.metrics?.population_exposure ?? ""},${r.metrics?.building_count ?? ""},${r.metrics?.forest_overlap_km2 ?? ""},${r.metrics?.acquisition_friction_index ?? ""},${r.metrics?.mean_slope_deg ?? ""}`
    ).join("\n");
    downloadBlob(header + rows, `InfraDrishti_Routes_Summary_${Date.now()}.csv`, "text/csv");
  };

  return (
    <main className="app">
      <ProcessingOverlay
        status={processingStatus}
        error={processingError}
        onDismiss={() => { setProcessingStatus(null); setProcessingError(null); }}
      />

      <header className="topBar">
        <div className="brand" onClick={() => setAppMode('CORRIDOR')}>
          <img src="/logo.png" alt="InfraDrishti" style={{ height: '40px', objectFit: 'contain' }} />
          <div className="brandName">InfraDrishti</div>
        </div>

        <nav className="topNavLinks">
          {[
            ['CORRIDOR', 'Corridor Planner'],
            ['SITE', 'Site Finder'],
            ['NATIONAL', 'National Dashboard'],
            ['MACRO', 'Macro-Economic'],
            ['GLOBAL', 'Global Intelligence'],
          ].map(([mode, label]) => (
            <button key={mode} className={`navLinkBtn ${appMode === mode ? 'active' : ''}`} onClick={() => setAppMode(mode)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="topUtilityIcons">
          <button className="iconActionBtn" title="Request History" onClick={() => setIsHistoryOpen(true)}><History size={16} /></button>
          <button className="iconActionBtn" title="Project Pipeline Modules" onClick={() => setIsProjectMenuOpen(true)}><Folder size={16} /></button>
          <button className="iconActionBtn" title="Macro Analytics" onClick={() => setAppMode('MACRO')}><Activity size={16} /></button>
          <button className="profileAvatarBtn" title="Demo User & Session" onClick={() => setIsProfileOpen(true)}><User size={14} /></button>
        </div>
      </header>

      <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} onSignOut={signOut} />
      <RequestHistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} session={session} />

      {isProjectMenuOpen && (
        <div className="drawerOverlay" onClick={() => setIsProjectMenuOpen(false)}>
          <div className="sideDrawerCard" onClick={e => e.stopPropagation()}>
            <div className="drawerHeader">
              <div>
                <h3 style={{ margin: 0 }}>Project Architecture</h3>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>InfraDrishti Geospatial Decision Engine</span>
              </div>
              <button className="iconActionBtn" onClick={() => setIsProjectMenuOpen(false)}><X size={16} /></button>
            </div>
            <div className="drawerBody">
              <ProjectIntelligenceMenu />
            </div>
          </div>
        </div>
      )}

      {appMode === 'CORRIDOR' ? (
        <div className="mainWorkspace">
          <aside className="leftSidebar">
            <div className="sidebarScrollContent">
              <div className="stepIndicatorBar">
                <div
                  className={`stepItem ${isAoiComplete ? 'completed' : 'active'}`}
                  onClick={() => scrollToSection('sec-aoi')}
                  title="Step 1: Terminal Locations (Click to jump)"
                >
                  <div className="stepCircle">{isAoiComplete ? <Check size={11} strokeWidth={3} /> : 1}</div>
                  <span className="stepLabel">AOI</span>
                </div>
                <div className={`stepConnector ${isAoiComplete ? 'active' : ''}`} />
                <div
                  className={`stepItem ${isAoiComplete ? 'active' : ''}`}
                  onClick={() => scrollToSection('sec-params')}
                  title="Step 2: Highway Specifications (Click to jump)"
                >
                  <div className="stepCircle">2</div>
                  <span className="stepLabel">Params</span>
                </div>
                <div className={`stepConnector ${isAoiComplete ? 'active' : ''}`} />
                <div
                  className={`stepItem ${isAoiComplete ? 'active' : ''}`}
                  onClick={() => scrollToSection('sec-mcda')}
                  title="Step 3: MCDA Decision Weights (Click to jump)"
                >
                  <div className="stepCircle">3</div>
                  <span className="stepLabel">MCDA</span>
                </div>
                <div className={`stepConnector ${scoredRoutes.length > 0 ? 'active' : ''}`} />
                <div
                  className={`stepItem ${scoredRoutes.length > 0 ? 'completed' : (processingStatus === 'PROCESSING' ? 'active' : '')}`}
                  onClick={() => {
                    scrollToSection('sec-run');
                    if (isAoiComplete && processingStatus !== 'PROCESSING') runSpatialAnalysis();
                  }}
                  title="Step 4: Execute Analysis (Click to run)"
                >
                  <div className="stepCircle">
                    {scoredRoutes.length > 0 ? <Check size={11} strokeWidth={3} /> : 4}
                  </div>
                  <span className="stepLabel">Run</span>
                </div>
              </div>

              <div id="sec-aoi">
                <div className="sidebarSectionLabel">Route Terminals</div>
                <div className="terminalsContainer">
                  <LocationSearchInput
                    label="Origin"
                    icon={<CircleDot size={14} color="#ea580c" />}
                    value={origin}
                    onSelectLocation={(loc) => setOrigin(loc)}
                    onClearLocation={() => setOrigin(o => ({ name: o.name, coords: null }))}
                    placeholder="Search origin..."
                  />
                  <button
                    type="button"
                    className="swapTerminalsBtn"
                    title="Swap Origin and Destination"
                    onClick={handleSwapTerminals}
                  >
                    <ArrowUpDown size={13} />
                  </button>
                  <LocationSearchInput
                    label="Destination"
                    icon={<MapPin size={14} color="#ef4444" />}
                    value={destination}
                    onSelectLocation={(loc) => setDestination(loc)}
                    onClearLocation={() => setDestination(d => ({ name: d.name, coords: null }))}
                    placeholder="Search destination..."
                  />
                </div>
              </div>

              <div className="sectionDivider" />

              <div id="sec-params">
                <div className="sidebarSectionLabel">Infrastructure Class</div>
                <select className="selectDropdown" value={infraClass} onChange={e => setInfraClass(e.target.value)}>
                  <option value="Expressway (6-Lane)">Expressway (6-Lane)</option>
                  <option value="Heavy Rail (Freight)">Heavy Rail (Freight)</option>
                  <option value="High-Speed Rail">High-Speed Rail</option>
                  <option value="Power Transmission Line">Power Transmission Line</option>
                </select>

                <div className="weightsHeaderRow" style={{ marginTop: '10px' }}>
                  <span className="sidebarSectionLabel" style={{ margin: 0 }}>Corridor Width</span>
                  <span className="weightsSumBadge">{corridorWidthM} m</span>
                </div>
                <input type="range" min="100" max="1000" step="50" className="cleanRangeSlider" value={corridorWidthM} onChange={e => setCorridorWidthM(Number(e.target.value))} />

                <div className="weightsHeaderRow" style={{ marginTop: '10px' }}>
                  <span className="sidebarSectionLabel" style={{ margin: 0 }}>Number of Routes</span>
                  <span className="weightsSumBadge">{nRoutes}</span>
                </div>
                <select className="selectDropdown" value={nRoutes} onChange={e => setNRoutes(Number(e.target.value))}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </div>

              <div className="sectionDivider" />

              <div id="sec-mcda">
                <div className="weightsHeaderRow">
                  <span className="sidebarSectionLabel" style={{ margin: 0 }}>MCDA Weights</span>
                  <span className="weightsSumBadge">{terrainWeight + landCostWeight + ecologicalWeight}%</span>
                </div>
                <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 8px' }}>
                  Protected areas and major water bodies are always hard constraints.
                </p>

                <WeightSlider label="Terrain gradient" value={terrainWeight} onChange={setTerrainWeight} />
                <WeightSlider label="Land acquisition friction" value={landCostWeight} onChange={setLandCostWeight} />
                <WeightSlider label="Ecological sensitivity" value={ecologicalWeight} onChange={setEcologicalWeight} />
              </div>
            </div>

            <div id="sec-run">
              <button className="runAnalysisActionBtn" onClick={runSpatialAnalysis}>
                <Play size={13} fill="#ffffff" />
                <span>Run Spatial Analysis</span>
              </button>
            </div>
          </aside>

          <section className="mapWorkspaceContainer">
            <div className="mapTopFloatingBar">
              <div className="mapTabPillGroup">
                <button className="mapTabPillBtn active" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Navigation size={13} color="#ea580c" style={{ transform: 'rotate(45deg)' }} />
                  <span>Route Analysis</span>
                </button>
              </div>
              <div className="mapStatsFloatingCard">
                <div className="mapStatCol">
                  <span className="mapStatLabel">FEASIBLE CORRIDORS</span>
                  <span className="mapStatValue">{scoredRoutes.length || 0}</span>
                </div>
                <div className="mapStatDivider" />
                <div className="mapStatCol">
                  <span className="mapStatLabel">ROUTES REQUESTED</span>
                  <span className="mapStatValue">{nRoutes}</span>
                </div>
              </div>
            </div>

            <InteractiveMap
              origin={origin}
              destination={destination}
              routesGeoJSON={routesGeoJSON}
              selectedRouteId={selectedRouteId}
              onSelectRoute={id => setSelectedRouteId(id)}
              bufferMeters={corridorWidthM}
              nRoutes={nRoutes}
              isSiteMode={false}
            />

            <div className="mapBottomLegendCard">
              <div className="legendHeaderRow" onClick={() => setIsLegendOpen(!isLegendOpen)}>
                <span className="legendCardTitle">LEGEND</span>
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                  {isLegendOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </span>
              </div>
              {isLegendOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                  {scoredRoutes.length > 0 ? (
                    <>
                      {scoredRoutes.map((r) => (
                        <div className="legendItemRow" key={r.id}>
                          <div
                            className="legendSymbolPill"
                            style={{ backgroundColor: ROUTE_COLORS[r.id] || '#2563eb' }}
                          />
                          <span>{r.name} ({r.tag === 'OPTIMAL' ? 'Optimal' : 'Alt'})</span>
                        </div>
                      ))}
                      <div className="legendItemRow">
                        <div className="legendSymbolConstraint" />
                        <span>Corridor buffer ({corridorWidthM} m)</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="legendItemRow">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                        <span>Origin ({origin?.name || "Origin"})</span>
                      </div>
                      <div className="legendItemRow">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                        <span>Destination ({destination?.name || "Destination"})</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside className="rightResultsPanel">
            <div className="resultsScrollContent">
              <div className="resultsHeaderTitle">Computed Routes</div>

              <div className="routeCardsList">
                {scoredRoutes.length === 0 && !processingStatus && (
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>Run an analysis to compute routes.</p>
                )}
                {scoredRoutes.map((route) => {
                  const isSelected = route.id === selectedRouteId;
                  const routeColor = ROUTE_COLORS[route.id] || '#2563eb';
                  return (
                    <div
                      key={route.id}
                      className={`routeCardItem ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedRouteId(route.id)}
                      style={isSelected ? { borderColor: routeColor, boxShadow: `0 0 0 1px ${routeColor}` } : {}}
                    >
                      <div className="routeCardTopRow">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="routeColorDot" style={{ backgroundColor: routeColor }} />
                          <span className="routeCardName">{route.name}</span>
                        </div>
                        <span className="routeScoreBadge" style={isSelected ? { color: routeColor } : {}}>
                          Score: {route.score}/100
                        </span>
                      </div>
                      <div className="routeCardSubtag" style={isSelected ? { color: routeColor } : {}}>
                        {route.tag === 'OPTIMAL' ? 'Optimal Alignment' : `Alternative Alignment (${route.id})`}
                      </div>
                      <div className="routeCardMetricsRow">
                        <div className="routeMetricCol">
                          <span className="routeMetricLabel">Length</span>
                          <span className="routeMetricVal">{route.lengthKm != null ? `${route.lengthKm} km` : '—'}</span>
                        </div>
                        <div className="routeMetricCol" style={{ textAlign: 'right' }}>
                          <span className="routeMetricLabel" title="Grid-quantization accuracy of the raster endpoint snap (≤35 m on a 50 m grid; same value for all routes)">Grid snap ℹ</span>
                          <span className="routeMetricVal">{route.gridSnapM != null ? `${route.gridSnapM} m` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedRoute && (
                <>
                  <div className="sectionDivider" />
                  <div className="analysisDetailsBlock">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span className="analysisDetailsTitle">{selectedRoute.name} Impact & MCDA</span>
                      <span className="routeScoreBadge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                        Score: {selectedRoute.score}/100
                      </span>
                    </div>

                    <div className="analysisMetricsTable">
                      {/* 1. Environmental Impact */}
                      {renderCategoryGroup("environment", "Environmental & Ecology", Trees, [
                        "forest_overlap_km2", "cropland_overlap_km2", "river_crossings", "water_cell_overlap"
                      ], selectedRoute)}

                      {/* 2. Social & Settlement Impact */}
                      {renderCategoryGroup("social", "Social & Land Acquisition", Users, [
                        "population_exposure", "building_count", "acquisition_friction_index"
                      ], selectedRoute)}

                      {/* 3. Terrain & Engineering */}
                      {renderCategoryGroup("terrain", "Terrain & Engineering", Mountain, [
                        "mean_slope_deg", "max_slope_deg", "route_length_km", "dist_to_highway_m"
                      ], selectedRoute)}
                    </div>

                    {/* AI Decision Intelligence Box */}
                    {selectedRoute.explanation && (
                      <div className="mcdaIntelligenceCard">
                        <div className="mcdaIntelligenceHeader">
                          <Sparkles size={14} className="mcdaSparkleIcon" />
                          <span>AI Decision Intelligence Summary</span>
                          <ChevronRight size={14} style={{ marginLeft: 'auto', color: '#ea580c' }} />
                        </div>
                        <p className="mcdaIntelligenceText">
                          {(typeof selectedRoute.explanation === 'string'
                            ? selectedRoute.explanation
                            : selectedRoute.explanation.text || ''
                          ).replace(/###\s*/g, '').replace(/WHY THIS ROUTE RANKS HIGHEST/gi, '').trim()}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="sectionDivider" />

              <div className="exportSectionBlock">
                <div className="exportSectionTitle">EXPORT GEOMETRY</div>
                <div className="exportButtonsRow">
                  <button className="exportOutlineBtn" onClick={handleExportGeoJSON} disabled={!routesGeoJSON} title="Download GeoJSON">
                    <Code size={14} /><span>GeoJSON</span>
                  </button>
                  <button className="exportOutlineBtn" onClick={handleExportCSV} disabled={!scoredRoutes.length} title="Download CSV">
                    <FileSpreadsheet size={14} /><span>CSV</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : appMode === 'SITE' ? (
        <SiteFinder />
      ) : appMode === 'NATIONAL' ? (
        <NationalDashboard historyLogs={[]} lastResult={scoredRoutes} />
      ) : appMode === 'MACRO' ? (
        <MacroDashboard scoredRoutes={scoredRoutes} />
      ) : (
        <GlobalDashboard />
      )}

      <footer className="appFooter">
        <div className="footerBrandCopy">
          <strong>InfraDrishti</strong>
          <span>Geospatial decision-support for infrastructure corridor planning and site selection.</span>
        </div>
        <div className="footerLinksRow">
          <a href="#disclaimers" className="footerLink">Legal Disclaimers</a>
          <a href="#privacy" className="footerLink">Privacy</a>
        </div>
      </footer>
    </main>
  );
}

// Defined at module scope so React gets a stable component reference
// across renders. If defined inside App, React remounts on every render
// which interrupts slider drag immediately.
function WeightSlider({ label, value, onChange }) {
  return (
    <div className="weightSliderItem">
      <div className="weightSliderLabelRow">
        <span>{label}</span>
        <span className="weightSliderValue">{value}%</span>
      </div>
      <input type="range" min="0" max="100" className="cleanRangeSlider" value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

function fmtMetric(v) {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return Math.round(v * 100) / 100;
  }
  return v;
}

function renderCategoryGroup(catKey, catTitle, CatIcon, metricKeys, route) {
  const availableKeys = metricKeys.filter(k => route.metrics?.[k] != null || route.weights?.[k] != null);
  if (availableKeys.length === 0) return null;

  return (
    <div className="mcdaCategoryGroup" key={catKey}>
      <div className="mcdaCategoryHeader">
        <CatIcon size={13} />
        <span>{catTitle}</span>
      </div>
      {availableKeys.map(key => {
        const conf = METRIC_CONFIG[key] || { label: key, unit: '', icon: CatIcon, category: catKey };
        const Icon = conf.icon || CatIcon;
        const val = route.metrics?.[key];
        const weight = Number(route.weights?.[key] || 0);
        const weightPct = Math.round(weight * 100);
        const contribution = Number(route.weightedContributions?.[key] || 0);
        const progressPct = Math.min(100, Math.max(0, weight > 0 ? (contribution / weight) * 100 : 0));
        const isZeroOptimal = conf.isOptimalZero && (val === 0 || val == null);

        return (
          <div className="mcdaCardItem" key={key}>
            <div className="mcdaCardTop">
              <div className="mcdaCardLeft">
                <div className={`mcdaCardIconBox ${conf.category}`}>
                  <Icon size={12} />
                </div>
                <span className="mcdaCardTitle">{conf.label}</span>
                {weightPct > 0 && (
                  <span className="mcdaWeightBadge" title="Weight in MCDA calculation">
                    {weightPct}% wt
                  </span>
                )}
              </div>
              <div className="mcdaCardRight">
                {isZeroOptimal ? (
                  <span className="mcdaZeroBadge">
                    <CheckCircle2 size={10} /> 0 {conf.unit} (Pristine)
                  </span>
                ) : (
                  <>
                    <span className="mcdaCardValue">{fmtMetric(val)}</span>
                    <span className="mcdaCardUnit">{conf.unit}</span>
                  </>
                )}
              </div>
            </div>
            {weightPct > 0 && (
              <div className="mcdaProgressTrack" title={`Contribution: ${(contribution * 100).toFixed(1)}%`}>
                <div
                  className="mcdaProgressFill"
                  style={{
                    width: `${progressPct}%`,
                    background: conf.category === 'terrain' ? '#059669' : '#ea580c'
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}