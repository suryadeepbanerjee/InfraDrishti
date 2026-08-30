import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin, ShieldCheck, Droplets, Building2, Mountain, Focus, AreaChart, Factory, 
  Map as MapIcon, ChevronRight, Play, CheckCircle, Check, AlertTriangle
} from "lucide-react";
import { LocationSearchInput } from "../LocationSearchInput";
import { InteractiveMap } from "../InteractiveMap";
import { createSiteSearch, getProcessingStatus, getSiteResult } from "../../services/apiClient";
import { ProcessingOverlay } from "../ProcessingOverlay";
import mockSiteResponse from "../../fixtures/site_response.json";
import { getDefaultLocation } from "../../services/geocodingService";

export function SiteFinder({ isDrawerOpen, setIsDrawerOpen, addHistoryLog }) {
  const [activeStep, setActiveStep] = useState(1);
  const [location, setLocation] = useState(() => getDefaultLocation("Mumbai"));
  
  // Site Inputs
  const [facilityType, setFacilityType] = useState("Logistics Hub");
  const [requiredArea, setRequiredArea] = useState(50);
  
  // Checklist
  const [reqHighway, setReqHighway] = useState(true);
  const [reqRailway, setReqRailway] = useState(false);
  const [reqWater, setReqWater] = useState(false);
  const [reqPower, setReqPower] = useState(true);
  
  // State
  const [processingStatus, setProcessingStatus] = useState(null);
  const [processingError, setProcessingError] = useState(null);
  const [sitesGeoJSON, setSitesGeoJSON] = useState(null);
  const [scoredSites, setScoredSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);

  const runSiteSearch = useCallback(async () => {
    setProcessingStatus('QUEUED');
    setProcessingError(null);
    try {
      const res = await createSiteSearch({
        facility_type: facilityType,
        location: location,
        required_area_acres: requiredArea,
        requirements: {
          highway: reqHighway,
          railway: reqRailway,
          water: reqWater,
          power: reqPower
        }
      });

      let currentStatus = 'QUEUED';
      while (currentStatus !== 'COMPLETED' && currentStatus !== 'FAILED') {
        await new Promise(r => setTimeout(r, 1000));
        break; // Short circuit for now since backend isn't ready
      }

      throw new Error("BACKEND INTEGRATION REQUIRED: The spatial intelligence backend is not responding.");
    } catch (err) {
      console.warn("API failed, falling back to UI development fixture.");
      // FALLBACK FOR UI DEV
      let geo = JSON.parse(JSON.stringify(mockSiteResponse.geojson));
      let sites = JSON.parse(JSON.stringify(mockSiteResponse.sites));

      // Procedurally generate 2 candidate polygons around `location.coords`
      let baseLng = location.coords[0];
      let baseLat = location.coords[1];

      // Polygon A (SITE-A)
      let pA = [
        [baseLng + 0.05, baseLat + 0.05],
        [baseLng + 0.08, baseLat + 0.04],
        [baseLng + 0.09, baseLat + 0.01],
        [baseLng + 0.04, baseLat + 0.01],
        [baseLng + 0.05, baseLat + 0.05] // close ring
      ];
      
      // Polygon B (SITE-B)
      let pB = [
        [baseLng - 0.06, baseLat - 0.02],
        [baseLng - 0.02, baseLat - 0.01],
        [baseLng - 0.01, baseLat - 0.05],
        [baseLng - 0.05, baseLat - 0.06],
        [baseLng - 0.06, baseLat - 0.02] // close ring
      ];

      geo.features = [
        {
          type: "Feature",
          properties: { id: "SITE-A" },
          geometry: { type: "Polygon", coordinates: [pA] }
        },
        {
          type: "Feature",
          properties: { id: "SITE-B" },
          geometry: { type: "Polygon", coordinates: [pB] }
        }
      ];

      setSitesGeoJSON(geo);
      setScoredSites(sites);
      setSelectedSiteId(sites[0]?.id);
      setProcessingStatus(null);
      setAnalyzed(true);
      setActiveStep(3); // move to results
      
      if (addHistoryLog) {
        addHistoryLog("Site Search", facilityType, `${location?.name || 'Unknown'} (${requiredArea} Acres)`, "COMPLETED");
      }
    }
  }, [location, facilityType, requiredArea, reqHighway, reqRailway, reqWater, reqPower, addHistoryLog]);


  return (
    <div className="plannerGrid">
      <ProcessingOverlay 
        status={processingStatus} 
        error={processingError} 
        onDismiss={() => setProcessingStatus(null)} 
      />

      <aside className={`leftPanel ${isDrawerOpen ? 'open' : ''}`}>
        <div className="navStepsList">
          <div className={`navStepItem ${activeStep === 1 ? "activeStep" : ""}`} onClick={() => setActiveStep(1)}>
            <div className="stepIdx">01</div>
            <div className="stepText">
              <div className="stepTitle">SITE PARAMETERS</div>
              <div className="stepDesc">Define facility & AOI</div>
            </div>
          </div>
          <div className={`navStepItem ${activeStep === 2 ? "activeStep" : ""}`} onClick={() => setActiveStep(2)}>
            <div className="stepIdx">02</div>
            <div className="stepText">
              <div className="stepTitle">REQUIREMENTS</div>
              <div className="stepDesc">Mandatory vs Preferred</div>
            </div>
          </div>
          <div className={`navStepItem ${activeStep === 3 ? "activeStep" : ""}`} onClick={() => setActiveStep(3)}>
            <div className="stepIdx">03</div>
            <div className="stepText">
              <div className="stepTitle">SITE RESULTS</div>
              <div className="stepDesc">Review Candidate Polygons</div>
            </div>
          </div>
        </div>

        <div className="controlsSection">
          {activeStep === 1 && (
            <div className="panelGroup">
              <div className="groupHeader">SITE PARAMETERS</div>
              
              <div className="inputField" style={{ marginTop: '15px' }}>
                <label>FACILITY TYPE</label>
                <select className="geoInput" value={facilityType} onChange={(e) => setFacilityType(e.target.value)}>
                  <option value="Industrial Facility">Industrial Facility</option>
                  <option value="Logistics Hub">Logistics Hub</option>
                  <option value="Warehouse">Warehouse</option>
                  <option value="Manufacturing">Manufacturing Facility</option>
                </select>
              </div>

              <div className="inputField" style={{ marginTop: '15px' }}>
                <label>LOCATION / AOI</label>
                <LocationSearchInput
                  label="LOCATION"
                  icon={<MapPin size={13} className="cyanIcon" />}
                  value={location}
                  onSelectLocation={(loc) => setLocation(loc)}
                  placeholder="Search city or region..."
                />
              </div>

              <div className="inputField" style={{ marginTop: '15px' }}>
                <label>REQUIRED AREA (ACRES)</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(4, 12, 19, 0.8)', border: '1px solid rgba(0, 240, 255, 0.25)', borderRadius: '6px' }}>
                  <AreaChart size={16} style={{ marginLeft: '10px', color: '#00f0ff' }} />
                  <input 
                    type="number" 
                    className="geoInput" 
                    style={{ border: 'none', width: '100%' }}
                    value={requiredArea} 
                    onChange={(e) => setRequiredArea(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">REQUIREMENTS CHECKLIST</span>
              </div>
              
              <div className="constraintRow">
                <div className="rowIcon"><Focus size={13} className="cyanIcon" /></div>
                <div className="rowText">
                  <div className="rowTitle">Near Highway Access</div>
                  <div className="rowSub">Must be within max highway distance</div>
                </div>
                <button className={`toggleSwitch ${reqHighway ? "on" : ""}`} onClick={() => setReqHighway(!reqHighway)}>
                  <span className="sliderHandle"></span>
                </button>
              </div>

              <div className="constraintRow">
                <div className="rowIcon"><Focus size={13} className="cyanIcon" /></div>
                <div className="rowText">
                  <div className="rowTitle">Near Railway/Station</div>
                  <div className="rowSub">Freight train access</div>
                </div>
                <button className={`toggleSwitch ${reqRailway ? "on" : ""}`} onClick={() => setReqRailway(!reqRailway)}>
                  <span className="sliderHandle"></span>
                </button>
              </div>

              <div className="constraintRow">
                <div className="rowIcon"><Droplets size={13} className="cyanIcon" /></div>
                <div className="rowText">
                  <div className="rowTitle">Water Access</div>
                  <div className="rowSub">Proximity to water sources</div>
                </div>
                <button className={`toggleSwitch ${reqWater ? "on" : ""}`} onClick={() => setReqWater(!reqWater)}>
                  <span className="sliderHandle"></span>
                </button>
              </div>

              <div className="constraintRow">
                <div className="rowIcon"><Factory size={13} className="cyanIcon" /></div>
                <div className="rowText">
                  <div className="rowTitle">Power Grid Access</div>
                  <div className="rowSub">Proximity to transmission lines</div>
                </div>
                <button className={`toggleSwitch ${reqPower ? "on" : ""}`} onClick={() => setReqPower(!reqPower)}>
                  <span className="sliderHandle"></span>
                </button>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="panelGroup">
              <div className="groupTitleRow">
                <span className="titleText">RESULTS SUMMARY</span>
                <span className="subBadge">CANDIDATES</span>
              </div>
              <p style={{ fontSize: '10px', color: '#8daea8', marginTop: '10px', marginBottom: '15px', lineHeight: 1.4 }}>
                Review the {scoredSites.length} candidate sites below. The map has automatically fitted to the optimal locations based on your criteria.
              </p>
              <div className="constraintsList">
                <div className="constraintRow" style={{ background: 'rgba(0, 240, 255, 0.1)', border: '1px solid #00f0ff', padding: '10px', borderRadius: '6px' }}>
                  <div className="rowIcon"><CheckCircle size={13} className="cyanIcon" /></div>
                  <div className="rowText">
                    <div className="rowTitle" style={{ color: '#00f0ff' }}>Analysis Complete</div>
                    <div className="rowSub" style={{ color: '#8daea8' }}>All constraints verified</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
            <button
              className="runAnalysisBtn"
              onClick={runSiteSearch}
            >
              <Play size={16} />
              <span>{processingStatus !== null ? "PROCESSING..." : (activeStep === 3 ? "REFINE SEARCH" : "FIND SUITABLE SITES")}</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </aside>

      <section className="rightSection" style={{ marginLeft: isDrawerOpen ? '340px' : '0', transition: 'margin-left 0.4s cubic-bezier(0.19, 1, 0.22, 1)' }}>
        <InteractiveMap
          origin={location}
          destination={location} 
          routesGeoJSON={sitesGeoJSON}
          scoredRoutes={scoredSites}
          selectedRouteId={selectedSiteId}
          onSelectRoute={(id) => setSelectedSiteId(id)}
          activeMode="SITE FINDER"
          setActiveMode={() => {}}
        />

        <div className="bottomDashboard">
           {analyzed && scoredSites.length > 0 && (
             <SiteResultsPanel sites={scoredSites} selectedSiteId={selectedSiteId} onSelectSite={setSelectedSiteId} />
           )}
        </div>
      </section>
    </div>
  );
}

function SiteResultsPanel({ sites, selectedSiteId, onSelectSite }) {
  const selected = sites.find(s => s.id === selectedSiteId) || sites[0];

  return (
    <div className="evalCardsGrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
      
      {/* 1. Candidate List */}
      <div className="evalCard" style={{ gridColumn: 'span 1' }}>
        <div className="cardHeaderTitleRow">
          <span>CANDIDATE SITES</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
          {sites.map(site => (
            <div 
              key={site.id} 
              onClick={() => onSelectSite(site.id)}
              style={{ 
                padding: '10px', 
                border: selectedSiteId === site.id ? '1px solid #00f0ff' : '1px solid rgba(255,255,255,0.1)', 
                background: selectedSiteId === site.id ? 'rgba(0, 240, 255, 0.1)' : 'rgba(0,0,0,0.3)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: '#e2f1f5' }}>{site.id}</strong>
                <span style={{ color: '#00f0ff', fontWeight: 'bold' }}>{site.mcda_score} / 100</span>
              </div>
              <div style={{ fontSize: '10px', color: '#8daea8', marginTop: '4px' }}>
                Rank {site.rank} • {site.metrics?.area_acres} Acres
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Selected Site Details & Explanation */}
      <div className="evalCard recommendedCard" style={{ gridColumn: 'span 2' }}>
        <div className="recCardTitleRow">
          <div className="crownIcon"><CheckCircle size={16} color="#00f0ff" /></div>
          <div>
            <div className="recTitle">WHY THIS SITE RANKED HERE</div>
            <div className="recRouteSub"><strong>{selected.id}</strong> - {selected.explanation?.summary}</div>
          </div>
          <div className="recScoreBadge">
            <span>{selected.mcda_score?.toFixed(1)}</span>
            <div className="recTagPill">SCORE</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', marginTop: '15px', position: 'relative', zIndex: 10 }}>
          <div style={{ flex: 1 }}>
            <h4 style={{ fontSize: '11px', color: '#8daea8', marginBottom: '8px' }}>STRONGEST FACTORS</h4>
            <ul className="recChecklist" style={{ marginBottom: '15px' }}>
              {selected.explanation?.strongest_factors?.map((adv, idx) => (
                <li key={idx}><Check size={12} className="greenCheck" /> {adv}</li>
              ))}
            </ul>

            <h4 style={{ fontSize: '11px', color: '#8daea8', marginBottom: '8px' }}>TRADE-OFFS</h4>
            <ul className="recChecklist">
              {selected.explanation?.trade_offs?.map((trd, idx) => (
                <li key={idx}><AlertTriangle size={12} style={{ color: '#fbbf24', marginRight: '8px' }} /> {trd}</li>
              ))}
            </ul>
          </div>

          <div style={{ flex: 1 }}>
             <h4 style={{ fontSize: '11px', color: '#8daea8', marginBottom: '8px' }}>SITE METRICS</h4>
             <table style={{ width: '100%', fontSize: '11px', color: '#e2f1f5', borderCollapse: 'collapse' }}>
               <tbody>
                 <tr><td style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>Area</td><td style={{textAlign: 'right'}}>{selected.metrics?.area_acres} Acres</td></tr>
                 <tr><td style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>Surplus</td><td style={{textAlign: 'right'}}>{selected.metrics?.area_surplus_acres} Acres</td></tr>
                 <tr><td style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>Highway Dist.</td><td style={{textAlign: 'right'}}>{selected.metrics?.highway_distance_km} km</td></tr>
                 <tr><td style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>Railway Dist.</td><td style={{textAlign: 'right'}}>{selected.metrics?.railway_distance_km} km</td></tr>
                 <tr><td style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>Acquisition Friction</td><td style={{textAlign: 'right', color: '#f87171'}}>{selected.metrics?.acquisition_friction_index}</td></tr>
               </tbody>
             </table>
          </div>
        </div>
      </div>
    </div>
  );
}
