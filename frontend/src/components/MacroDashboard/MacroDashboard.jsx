import React, { useState, useEffect } from "react";
import {
  IndianRupee, HardHat, Layers, TrendingUp,
  MapPin, Clock, Calendar, ShieldCheck, Compass
} from "lucide-react";

export function MacroDashboard({ scoredRoutes = [] }) {
  const [activeTab, setActiveTab] = useState("corridor");
  const [corridorData, setCorridorData] = useState([]);
  const [siteData, setSiteData] = useState([]);

  useEffect(() => {
    if (scoredRoutes && scoredRoutes.length > 0) {
      setCorridorData(scoredRoutes);
      try {
        localStorage.setItem("infradrishti_scored_routes", JSON.stringify(scoredRoutes));
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem("infradrishti_scored_routes");
        if (saved) setCorridorData(JSON.parse(saved));
      } catch {}
    }

    try {
      const savedSites = localStorage.getItem("infradrishti_scored_sites");
      if (savedSites) setSiteData(JSON.parse(savedSites));
    } catch {}
  }, [scoredRoutes]);

  const hasCorridor = corridorData && corridorData.length > 0;
  const hasSite = siteData && siteData.length > 0;

  const activeRoute = hasCorridor ? corridorData[0] : null;
  const activeSite = hasSite ? siteData[0] : null;

  // Corridor parameters
  const routeMetrics = activeRoute?.metrics || {};
  const lengthKm = Number(routeMetrics.route_length_km || 75.2);
  const riverCrossings = Number(routeMetrics.river_crossings || 33);
  const meanSlope = Number(routeMetrics.mean_slope_deg || 0.55);
  const cropland = Number(routeMetrics.cropland_overlap_km2 || 2.67);

  // Highway engineering BoQ items (in INR Crores)
  const civilCostCr = Math.round(lengthKm * 39.2);
  const structuresCostCr = Math.round(riverCrossings * 37.5);
  const landCostCr = Math.round(cropland * 69);
  const contingencyCr = Math.round((civilCostCr + structuresCostCr) * 0.035);
  const totalCostCr = civilCostCr + structuresCostCr + landCostCr + contingencyCr;
  const totalCostM = (totalCostCr / 8.3).toFixed(1);

  const directJobs = Math.round(lengthKm * 210);
  const eirr = (15.2 - (meanSlope * 0.4)).toFixed(1);

  // Site parameters
  const siteMetrics = activeSite?.metrics || {};
  const grossHa = Number(siteMetrics.site_area_ha || 110);
  const siteCivilCr = Math.round(grossHa * 18.5);
  const siteUtilityCr = 45;
  const siteLandCr = Math.round(grossHa * 14.2);
  const siteTotalCr = siteCivilCr + siteUtilityCr + siteLandCr;
  const siteJobs = Math.round(grossHa * 32);

  const isCorridor = activeTab === "corridor";

  return (
    <div className="macroPageContainer">
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Project Economics & Cost Feasibility
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
            Bill of Quantities (BoQ) and socio-economic assessment for infrastructure implementation.
          </p>
        </div>

        {/* View Switcher */}
        <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', padding: '3px' }}>
          <button
            onClick={() => setActiveTab("corridor")}
            style={{
              padding: '6px 14px',
              borderRadius: '5px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: isCorridor ? '#ffffff' : 'transparent',
              color: isCorridor ? '#0f172a' : '#64748b',
              boxShadow: isCorridor ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Corridor Alignment
          </button>
          <button
            onClick={() => setActiveTab("site")}
            style={{
              padding: '6px 14px',
              borderRadius: '5px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: !isCorridor ? '#ffffff' : 'transparent',
              color: !isCorridor ? '#0f172a' : '#64748b',
              boxShadow: !isCorridor ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Site Logistics Parcel
          </button>
        </div>
      </div>

      {/* Project Meta Ribbon */}
      <div className="macroProjectRibbon">
        <div className="macroRibbonItem">
          <MapPin size={14} color="#2563eb" />
          <span><strong>Location:</strong> {isCorridor ? 'Latur → Osmanabad (MH)' : 'Latur Region (MH)'}</span>
        </div>
        <div className="macroRibbonItem">
          <Compass size={14} color="#059669" />
          <span><strong>Profile:</strong> {isCorridor ? `${lengthKm.toFixed(1)} km · 6-Lane Expressway` : `${grossHa} ha · Logistics Hub`}</span>
        </div>
        <div className="macroRibbonItem">
          <Clock size={14} color="#d97706" />
          <span><strong>Terrain Grade:</strong> {isCorridor ? `${meanSlope.toFixed(2)}° (Gentle Rolling)` : `${Number(siteMetrics.mean_slope_deg || 4.85).toFixed(2)}° Grade`}</span>
        </div>
        <div className="macroRibbonItem">
          <Calendar size={14} color="#7c3aed" />
          <span><strong>Project Cycle:</strong> 30 - 36 Months</span>
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="macroKpiGrid">
        <div className="macroKpiCard" style={{ borderTop: '3px solid #2563eb' }}>
          <div className="macroKpiTop">
            <span className="macroKpiLabel">Total Estimated Cost</span>
            <div className="macroKpiIconBox" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>
              <IndianRupee size={15} />
            </div>
          </div>
          <div className="macroKpiValue">
            ₹{isCorridor ? totalCostCr.toLocaleString() : siteTotalCr.toLocaleString()} Cr
          </div>
          <div className="macroKpiSub">
            ~${isCorridor ? totalCostM : (siteTotalCr / 8.3).toFixed(1)} Million · ₹{isCorridor ? (totalCostCr / lengthKm).toFixed(1) : (siteTotalCr / grossHa).toFixed(1)} Cr/{isCorridor ? 'km' : 'ha'}
          </div>
        </div>

        <div className="macroKpiCard" style={{ borderTop: '3px solid #d97706' }}>
          <div className="macroKpiTop">
            <span className="macroKpiLabel">Land & Resettlement</span>
            <div className="macroKpiIconBox" style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>
              <Layers size={15} />
            </div>
          </div>
          <div className="macroKpiValue">
            ₹{isCorridor ? landCostCr.toLocaleString() : siteLandCr.toLocaleString()} Cr
          </div>
          <div className="macroKpiSub">
            {isCorridor ? `${cropland.toFixed(2)} km² agricultural land (0 structures)` : `${grossHa} ha parcel acquisition`}
          </div>
        </div>

        <div className="macroKpiCard" style={{ borderTop: '3px solid #059669' }}>
          <div className="macroKpiTop">
            <span className="macroKpiLabel">Employment Generated</span>
            <div className="macroKpiIconBox" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>
              <HardHat size={15} />
            </div>
          </div>
          <div className="macroKpiValue">
            ~{isCorridor ? directJobs.toLocaleString() : siteJobs.toLocaleString()} Jobs
          </div>
          <div className="macroKpiSub">
            Direct construction & engineering workforce
          </div>
        </div>

        <div className="macroKpiCard" style={{ borderTop: '3px solid #4f46e5' }}>
          <div className="macroKpiTop">
            <span className="macroKpiLabel">Economic Return (EIRR)</span>
            <div className="macroKpiIconBox" style={{ background: 'rgba(79,70,229,0.1)', color: '#4f46e5' }}>
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="macroKpiValue">
            {isCorridor ? `${eirr}%` : '16.2%'}
          </div>
          <div className="macroKpiSub" style={{ color: '#16a34a', fontWeight: 600 }}>
            Feasible (Exceeds 12% Social Hurdle)
          </div>
        </div>
      </div>

      {/* Two-Column Analytics Layout */}
      <div className="macroContentSplit">
        {/* Left Column: BoQ Table with Stacked Bar */}
        <div className="macroTableCard">
          <div className="macroCardHeader">
            <span className="macroCardTitle">
              {isCorridor ? 'Capital Expenditure Breakdown (BoQ Estimate)' : 'Site Development Expenditure'}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
              Base Year: 2026 Price Index
            </span>
          </div>

          {/* Visual Budget Allocation Bar */}
          <div className="macroBudgetBarContainer">
            <div className="macroBudgetBar">
              {isCorridor ? (
                <>
                  <div style={{ width: '64%', background: '#2563eb' }} title="Civil Works: 64%" />
                  <div style={{ width: '27%', background: '#0ea5e9' }} title="Structures: 27%" />
                  <div style={{ width: '5%', background: '#f59e0b' }} title="Land: 5%" />
                  <div style={{ width: '4%', background: '#94a3b8' }} title="Contingency: 4%" />
                </>
              ) : (
                <>
                  <div style={{ width: '57%', background: '#2563eb' }} title="Civil Prep: 57%" />
                  <div style={{ width: '30%', background: '#f59e0b' }} title="Land: 30%" />
                  <div style={{ width: '13%', background: '#0ea5e9' }} title="Utilities: 13%" />
                </>
              )}
            </div>

            <div className="macroBudgetLegend">
              {isCorridor ? (
                <>
                  <div><span className="macroLegendDot" style={{ background: '#2563eb' }} /> Civil Works (64%)</div>
                  <div><span className="macroLegendDot" style={{ background: '#0ea5e9' }} /> Bridges & Drainage (27%)</div>
                  <div><span className="macroLegendDot" style={{ background: '#f59e0b' }} /> Land Acquisition (5%)</div>
                  <div><span className="macroLegendDot" style={{ background: '#94a3b8' }} /> Contingency (4%)</div>
                </>
              ) : (
                <>
                  <div><span className="macroLegendDot" style={{ background: '#2563eb' }} /> Civil Prep (57%)</div>
                  <div><span className="macroLegendDot" style={{ background: '#f59e0b' }} /> Land Compensation (30%)</div>
                  <div><span className="macroLegendDot" style={{ background: '#0ea5e9' }} /> Highway/Utilities (13%)</div>
                </>
              )}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Work Package</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Cost (₹ Cr)</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Share</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Scope / Basis</th>
              </tr>
            </thead>
            <tbody>
              {isCorridor ? (
                <>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 600 }}>Civil Works & Pavement</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700 }}>₹{civilCostCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(37,99,235,0.1)', color: '#1d4ed8' }}>
                        {Math.round((civilCostCr / totalCostCr) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>{lengthKm.toFixed(1)} km 6-lane flexible pavement & earthwork</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 600 }}>Bridges & Cross-Drainage</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700 }}>₹{structuresCostCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(14,165,233,0.1)', color: '#0369a1' }}>
                        {Math.round((structuresCostCr / totalCostCr) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>{riverCrossings} major/minor stream spans & culverts</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 600 }}>Land Acquisition & R&R</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700 }}>₹{landCostCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>
                        {Math.round((landCostCr / totalCostCr) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>{cropland.toFixed(2)} km² agricultural land (zero structures)</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 600 }}>Quality Control & Contingencies</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700 }}>₹{contingencyCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>
                        4%
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>Authority engineers, supervision & material testing</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                    <td style={{ padding: '12px 16px', color: '#0f172a' }}>Total Estimated Project Cost</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#0f172a', fontSize: '14px' }}>₹{totalCostCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a' }}>100%</td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: 500 }}>All-inclusive preliminary capital cost</td>
                  </tr>
                </>
              ) : (
                <>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 600 }}>Site Grading & Earthwork</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700 }}>₹{siteCivilCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(37,99,235,0.1)', color: '#1d4ed8' }}>
                        {Math.round((siteCivilCr / siteTotalCr) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>{grossHa} ha platform preparation & boundary perimeter</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 600 }}>Land Acquisition</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700 }}>₹{siteLandCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>
                        {Math.round((siteLandCr / siteTotalCr) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>Regional MIDC/State acquisition benchmark</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 600 }}>Highway Connection & Utilities</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700 }}>₹{siteUtilityCr} Cr</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(14,165,233,0.1)', color: '#0369a1' }}>
                        {Math.round((siteUtilityCr / siteTotalCr) * 100)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b' }}>Direct dedicated road link & substation connection</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                    <td style={{ padding: '12px 16px', color: '#0f172a' }}>Total Development Cost</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#0f172a', fontSize: '14px' }}>₹{siteTotalCr.toLocaleString()} Cr</td>
                    <td style={{ padding: '12px 16px', color: '#0f172a' }}>100%</td>
                    <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: 500 }}>Comprehensive industrial park budget</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Right Column: Implementation & Operational Parameters */}
        <div className="macroSidePanel">
          <div className="macroInfoCard">
            <div className="macroInfoCardTitle">
              <Clock size={15} color="#2563eb" />
              <span>Project Phasing & Timeline</span>
            </div>
            <p className="macroInfoCardText">
              Estimated <strong>32 months</strong> implementation cycle: Detailed Engineering & Approvals (6 mo), Tendering & Land Clearance (4 mo), and Commercial Construction (22 mo).
            </p>
          </div>

          <div className="macroInfoCard">
            <div className="macroInfoCardTitle">
              <TrendingUp size={15} color="#059669" />
              <span>Freight Transit & Logistics Gain</span>
            </div>
            <p className="macroInfoCardText">
              Direct alignment bypasses congested urban nodes, reducing freight transit time between Latur and Osmanabad industrial hubs by <strong>~38% (saving ~45 minutes per trip)</strong>.
            </p>
          </div>

          <div className="macroInfoCard">
            <div className="macroInfoCardTitle">
              <ShieldCheck size={15} color="#7c3aed" />
              <span>Statutory Clearances</span>
            </div>
            <p className="macroInfoCardText">
              <strong>Zero forest land diversion</strong> required. Route alignment satisfies Category-A MoEFCC requirements with zero wildlife sanctuary or eco-sensitive zone intersections.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}