import React, { useState, useCallback } from "react";
import {
  MapPin, Play, Code, FileSpreadsheet, ChevronDown, ChevronUp,
  Mountain, Trees, Users, Home, Waves, Ruler, Scale, Sparkles, CheckCircle2, ShieldCheck,
  Navigation
} from "lucide-react";
import { InteractiveMap, ROUTE_COLORS } from "../InteractiveMap";
import { createSiteSearch } from "../../services/apiClient";
import { normalizeSiteFinderResponse } from "../../services/spatialAnalysisService";
import { ProcessingOverlay } from "../ProcessingOverlay";
import { LocationSearchInput } from "../LocationSearchInput";
import { useAuth } from "../../context/AuthContext";

const FACILITY_PROFILES = {
  "Logistics Hub": {
    badge: "Expressway Proximity",
    detail: "Prioritizes immediate highway access (<500m) and gentle gradient (<5°).",
  },
  "Manufacturing Plant": {
    badge: "Flat Grade & Water",
    detail: "Prioritizes planar terrain (<3°), industrial water access, and low building displacement.",
  },
  "Data Center Campus": {
    badge: "Grid & Safety",
    detail: "Prioritizes flood-free elevation, seismic safety, and dual transport corridors.",
  },
  "Renewable Solar Park": {
    badge: "Acreage & Sun",
    detail: "Prioritizes expansive contiguous acreage (100+ Acres) and slope <2°.",
  },
};

const SITE_METRIC_CONFIG = {
  site_area_ha: { label: "Contiguous Site Area", unit: "ha", icon: Ruler, category: "engineering" },
  mean_slope_deg: { label: "Mean Terrain Slope", unit: "°", icon: Mountain, category: "terrain" },
  dist_to_highway_m: { label: "Distance to Highway", unit: "m", icon: Ruler, category: "engineering" },
  dist_to_water_m: { label: "Distance to Water Body", unit: "m", icon: Waves, category: "environment" },
  acquisition_friction_index: { label: "Land Acquisition Friction (AFI)", unit: "/ 1.0", icon: Scale, category: "social" },
  pop_sum_1km_sq_approx: { label: "Nearby Population", unit: "people", icon: Users, category: "social" },
  building_count: { label: "Buildings Affected", unit: "structures", icon: Home, category: "social", isOptimalZero: true },
  cropland_fraction: { label: "Cropland Displacement", unit: "%", icon: Trees, category: "environment" },
  protected_area_overlap: { label: "Protected Area Overlap", unit: "cells", icon: Trees, category: "environment", isOptimalZero: true },
};

export function SiteFinder() {
  const { session, signOut } = useAuth();
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [location, setLocation] = useState({ name: "Latur", coords: [76.5726, 18.4088] });
  const [facilityType, setFacilityType] = useState("Logistics Hub");
  const [requiredArea, setRequiredArea] = useState(50);

  const [processingStatus, setProcessingStatus] = useState(null);
  const [processingError, setProcessingError] = useState(null);
  const [sitesGeoJSON, setSitesGeoJSON] = useState(null);
  const [scoredSites, setScoredSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);

  const runSiteSearch = useCallback(async () => {
    if (!location?.coords) {
      setProcessingError("Select a location first.");
      setProcessingStatus('FAILED');
      return;
    }
    setProcessingStatus('PROCESSING');
    setProcessingError(null);

    try {
      const data = await createSiteSearch({
        facility_type: facilityType,
        location: { lat: location.coords[1], lon: location.coords[0] },
        required_area_acres: requiredArea,
      }, session);

      const { geojson, scoredSites: sites } = normalizeSiteFinderResponse(data);

      setSitesGeoJSON(geojson);
      setScoredSites(sites);
      if (sites.length > 0) setSelectedSiteId(sites[0].id);
      setProcessingStatus('COMPLETED');
      setTimeout(() => setProcessingStatus(null), 1200);
    } catch (err) {
      if (err.code === 'SESSION_EXPIRED') {
        setProcessingError("Session expired. Please sign in again.");
        setTimeout(() => signOut(), 2000);
      } else if (err.code === 'AUTH_ERROR') {
        setProcessingError(err.message || "Authentication error. Please try again.");
      } else {
        setProcessingError(err.message || "Site search failed.");
      }
      setProcessingStatus('FAILED');
    }
  }, [facilityType, location, requiredArea, session, signOut]);

  const selectedSite = scoredSites.find(s => s.id === selectedSiteId) || scoredSites[0] || null;

  const handleExportGeoJSON = () => {
    if (!sitesGeoJSON) return;
    const blob = new Blob([JSON.stringify(sitesGeoJSON, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `InfraDrishti_Sites_${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!scoredSites.length) return;
    const headers = ["ID", "Name", "Tag", "Score", "Gross Area (ha)", "Gross Area (Acres)", "Highway Dist (m)", "Mean Slope (deg)"];
    const rows = scoredSites.map(s => [
      s.id,
      s.name,
      s.tag,
      s.score,
      s.metrics?.site_area_ha ?? "",
      s.metrics?.site_area_ha ? (s.metrics.site_area_ha * 2.47105).toFixed(1) : "",
      s.metrics?.dist_to_highway_m ?? "",
      s.metrics?.mean_slope_deg ?? ""
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `InfraDrishti_Sites_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mainWorkspace">
      <ProcessingOverlay
        status={processingStatus}
        error={processingError}
        onDismiss={() => { setProcessingStatus(null); setProcessingError(null); }}
        title="SCREENING SITES"
        subtitle="MCDA CONTIGUOUS PARCEL SEARCH"
        caption="Evaluating slope, terrain, proximity to highways, protected areas, and population density."
      />

      <aside className="leftSidebar">
        <div className="sidebarScrollContent">
          <div className="sidebarSectionLabel">Facility Type</div>
          <select className="selectDropdown" value={facilityType} onChange={e => setFacilityType(e.target.value)}>
            <option value="Logistics Hub">Logistics Hub</option>
            <option value="Manufacturing Plant">Manufacturing Plant</option>
            <option value="Data Center Campus">Data Center Campus</option>
            <option value="Renewable Solar Park">Renewable Solar Park</option>
          </select>

          {FACILITY_PROFILES[facilityType] && (
            <div style={{ marginTop: '6px', background: '#fffaf5', borderRadius: '6px', padding: '6px 8px', border: '1px solid #fed7aa' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={12} />
                <span>{FACILITY_PROFILES[facilityType].badge}</span>
              </div>
              <div style={{ fontSize: '10px', color: '#9a3412', marginTop: '2px', lineHeight: 1.35 }}>
                {FACILITY_PROFILES[facilityType].detail}
              </div>
            </div>
          )}

          <div className="sectionDivider" />

          <div className="sidebarSectionLabel">Search Region / AOI</div>
          <LocationSearchInput
            label="Search region"
            icon={<MapPin size={14} color="#ea580c" />}
            value={location}
            onSelectLocation={(loc) => setLocation(loc)}
            onClearLocation={() => setLocation(l => ({ name: l.name, coords: null }))}
            placeholder="Enter city or district..."
          />

          <div className="sectionDivider" />

          <div className="weightsHeaderRow">
            <span className="sidebarSectionLabel" style={{ margin: 0 }}>Required Area</span>
            <span className="weightsSumBadge">{requiredArea} Acres (~{(requiredArea * 0.404686).toFixed(1)} ha)</span>
          </div>
          <input type="range" min="10" max="250" step="5" className="cleanRangeSlider" value={requiredArea} onChange={e => setRequiredArea(Number(e.target.value))} />

          <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', lineHeight: 1.4 }}>
            Contiguous parcel screening filters by minimum area, terrain suitability, and highway network access.
          </p>
        </div>

        <button className="runAnalysisActionBtn" onClick={runSiteSearch}>
          <Play size={13} fill="#ffffff" />
          <span>Find Suitable Sites</span>
        </button>
      </aside>

      <section className="mapWorkspaceContainer">
        <div className="mapTopFloatingBar">
          <div className="mapTabPillGroup">
            <button className="mapTabPillBtn active" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Navigation size={13} color="#ea580c" style={{ transform: 'rotate(45deg)' }} />
              <span>Site Screening</span>
            </button>
          </div>
          <div className="mapStatsFloatingCard">
            <div className="mapStatCol">
              <span className="mapStatLabel">CANDIDATE SITES</span>
              <span className="mapStatValue">{scoredSites.length || 0}</span>
            </div>
            <div className="mapStatDivider" />
            <div className="mapStatCol">
              <span className="mapStatLabel">TARGET AREA</span>
              <span className="mapStatValue">{requiredArea} <small style={{ fontSize: '14px', fontWeight: 400 }}>Acres</small></span>
            </div>
          </div>
        </div>

        <InteractiveMap
          origin={location}
          destination={location}
          routesGeoJSON={sitesGeoJSON}
          selectedRouteId={selectedSiteId}
          onSelectRoute={id => setSelectedSiteId(id)}
          bufferMeters={0}
          isSiteMode={true}
        />

        <div className="mapBottomLegendCard">
          <div className="legendHeaderRow" onClick={() => setIsLegendOpen(!isLegendOpen)}>
            <span className="legendCardTitle">SITE LEGEND</span>
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {isLegendOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </span>
          </div>
          {isLegendOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
              {scoredSites.length > 0 ? (
                <>
                  {scoredSites.map(s => {
                    const color = ROUTE_COLORS[s.id] || '#2563eb';
                    const isSelected = s.id === selectedSiteId;
                    return (
                      <div
                        className="legendItemRow"
                        key={s.id}
                        onClick={() => setSelectedSiteId(s.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 10,
                            background: color,
                            opacity: isSelected ? 0.85 : 0.4,
                            border: `1.5px solid ${color}`,
                            borderRadius: 2
                          }}
                        />
                        <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                          {s.name} ({s.tag === 'OPTIMAL' ? 'Optimal' : `Rank ${s.rank}`})
                        </span>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className="legendItemRow">
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                    <span>Search Target ({location?.name || 'Location'})</span>
                  </div>
                  <div className="legendItemRow">
                    <div style={{ width: 14, height: 10, background: 'rgba(37,99,235,0.08)', border: '1.5px dashed #2563eb', borderRadius: 2 }} />
                    <span>Screening AOI Envelope</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="rightResultsPanel">
        <div className="resultsScrollContent">
          <div className="resultsHeaderTitle">Candidate Sites</div>

          <div className="routeCardsList">
            {scoredSites.length === 0 && !processingStatus && (
              <p style={{ fontSize: '12px', color: '#6b7280' }}>
                Set your facility requirements and click <strong>Find Suitable Sites</strong> to evaluate parcels.
              </p>
            )}
            {scoredSites.map(site => {
              const isSelected = site.id === selectedSiteId;
              const color = ROUTE_COLORS[site.id] || '#2563eb';
              const grossHa = site.metrics?.site_area_ha != null ? Math.round(site.metrics.site_area_ha) : null;
              const grossAcres = grossHa != null ? Math.round(grossHa * 2.47105) : null;

              return (
                <div
                  key={site.id}
                  className={`routeCardItem ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedSiteId(site.id)}
                  style={isSelected ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : {}}
                >
                  <div className="routeCardTopRow">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      <span className="routeCardName">{site.name}</span>
                    </div>
                    <span className="routeScoreBadge" style={isSelected ? { color: '#1d4ed8', background: '#dbeafe' } : {}}>
                      Score: {site.score}/100
                    </span>
                  </div>
                  <div className="routeCardSubtag" style={isSelected ? { color } : {}}>
                    {site.tag === 'OPTIMAL' ? '🏆 Optimal Match' : `Candidate Rank ${site.rank}`}
                  </div>
                  <div className="routeCardMetricsRow">
                    <div className="routeMetricCol">
                      <span className="routeMetricLabel">Gross Area</span>
                      <span className="routeMetricVal">
                        {grossHa != null ? `${grossHa} ha (${grossAcres} ac)` : '—'}
                      </span>
                    </div>
                    <div className="routeMetricCol" style={{ textAlign: 'right' }}>
                      <span className="routeMetricLabel">Highway Distance</span>
                      <span className="routeMetricVal">
                        {site.metrics?.dist_to_highway_m != null
                          ? site.metrics.dist_to_highway_m === 0
                            ? 'Direct (0 m)'
                            : `${Math.round(site.metrics.dist_to_highway_m)} m`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedSite && (
            <>
              <div className="sectionDivider" />
              <div className="analysisDetailsBlock">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span className="analysisDetailsTitle">{selectedSite.name} Suitability</span>
                  <span className="routeScoreBadge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                    Score: {selectedSite.score}/100
                  </span>
                </div>

                <div className="analysisMetricsTable">
                  {Object.keys(selectedSite.metrics || {}).map(metric => {
                    const conf = SITE_METRIC_CONFIG[metric] || { label: metric, unit: '', icon: Ruler, category: 'engineering' };
                    const Icon = conf.icon;
                    const val = selectedSite.metrics[metric];
                    const weight = Number(selectedSite.weights?.[metric] || 0);
                    const weightPct = Math.round(weight * 100);
                    const isZeroOptimal = conf.isOptimalZero && (val === 0 || val == null);

                    return (
                      <div className="mcdaCardItem" key={metric}>
                        <div className="mcdaCardTop">
                          <div className="mcdaCardLeft">
                            <div className={`mcdaCardIconBox ${conf.category}`}>
                              <Icon size={12} />
                            </div>
                            <span className="mcdaCardTitle">{conf.label}</span>
                            {weightPct > 0 && (
                              <span className="mcdaWeightBadge">
                                {weightPct}% wt
                              </span>
                            )}
                          </div>
                          <div className="mcdaCardRight">
                            {isZeroOptimal ? (
                              <span className="mcdaZeroBadge">
                                <CheckCircle2 size={10} /> 0 {conf.unit} (Optimal)
                              </span>
                            ) : (
                              <>
                                <span className="mcdaCardValue">{fmt(val)}</span>
                                <span className="mcdaCardUnit">{conf.unit}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* AI / Site Intelligence Summary */}
                {selectedSite.explanation && (
                  <div className="mcdaIntelligenceCard">
                    <div className="mcdaIntelligenceHeader">
                      <Sparkles size={14} className="mcdaSparkleIcon" />
                      <span>Site Intelligence Summary</span>
                    </div>
                    <p className="mcdaIntelligenceText">
                      {(typeof selectedSite.explanation === 'string'
                        ? selectedSite.explanation
                        : selectedSite.explanation.text || ''
                      ).replace(/###\s*/g, '').replace(/WHY THIS ROUTE RANKS HIGHEST/gi, '').trim()}
                    </p>
                  </div>
                )}
              </div>
              <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '8px' }}>
                Candidates are contiguous planning areas, not legal cadastral parcels.
              </p>
            </>
          )}

          <div className="sectionDivider" />

          <div className="exportSectionBlock">
            <div className="exportSectionTitle">EXPORT BOUNDARIES</div>
            <div className="exportButtonsRow">
              <button className="exportOutlineBtn" onClick={handleExportGeoJSON} disabled={!sitesGeoJSON}>
                <Code size={14} /><span>GeoJSON</span>
              </button>
              <button className="exportOutlineBtn" onClick={handleExportCSV} disabled={!scoredSites.length}>
                <FileSpreadsheet size={14} /><span>CSV</span>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function fmt(v) {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return Math.round(v * 100) / 100;
  }
  return v;
}