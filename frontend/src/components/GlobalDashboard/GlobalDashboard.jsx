import React, { useState } from "react";
import {
  Satellite, Globe, Layers, Database, ShieldCheck, CheckCircle2,
  MapPin, HardDrive, Waves, Mountain, Trees, Users, Route, Compass, ExternalLink
} from "lucide-react";

const DATASETS = [
  {
    id: "copernicus-dem",
    name: "Copernicus DEM (GLO-30)",
    category: "terrain",
    icon: Mountain,
    iconColor: "#2563eb",
    provider: "European Space Agency (ESA)",
    resolution: "30 m (GLO-30)",
    coverage: "Latur–Osmanabad AOI",
    purpose: "Elevation model → slope & gradient resistance surface",
    status: "Cache Ingested",
  },
  {
    id: "worldcover",
    name: "ESA WorldCover (10 m)",
    category: "ecology",
    icon: Trees,
    iconColor: "#059669",
    provider: "ESA / Sentinel-1 & 2",
    resolution: "10 m Multispectral",
    coverage: "Latur–Osmanabad AOI",
    purpose: "Land cover classification (cropland, forest canopy, built-up)",
    status: "Cache Ingested",
  },
  {
    id: "worldpop",
    name: "WorldPop India (100 m)",
    category: "demographics",
    icon: Users,
    iconColor: "#d97706",
    provider: "WorldPop / Southampton",
    resolution: "100 m Gridded",
    coverage: "Latur–Osmanabad AOI",
    purpose: "Demographic exposure buffer & community displacement count",
    status: "Cache Ingested",
  },
  {
    id: "jrc-water",
    name: "JRC Global Surface Water",
    category: "ecology",
    icon: Waves,
    iconColor: "#0284c7",
    provider: "European Commission JRC",
    resolution: "30 m Water Occurrence",
    coverage: "AOI Regional Sub-basin",
    purpose: "Surface water occurrence & perennial wetlands barrier",
    status: "Cache Ingested",
  },
  {
    id: "hydrorivers",
    name: "HydroRIVERS v10",
    category: "terrain",
    icon: Route,
    iconColor: "#7c3aed",
    provider: "HydroSHEDS / WWF",
    resolution: "15 arc-sec Vector",
    coverage: "Godavari-Krishna Basin",
    purpose: "River network intersections & bridge crossing detection",
    status: "Cache Ingested",
  },
  {
    id: "wdpa",
    name: "WDPA Protected Areas",
    category: "ecology",
    icon: ShieldCheck,
    iconColor: "#e11d48",
    provider: "UNEP-WCMC / IUCN",
    resolution: "Polygonal Boundaries",
    coverage: "National / State Extent",
    purpose: "Strict avoidance hard constraint (No protected area in AOI)",
    status: "Validated Zero Overlap",
  },
  {
    id: "osm",
    name: "OpenStreetMap Highway Grid",
    category: "demographics",
    icon: Compass,
    iconColor: "#475569",
    provider: "OSM / Geofabrik India",
    resolution: "Vector Road Network",
    coverage: "Maharashtra State Extent",
    purpose: "Existing highway connectivity & feeder link calculations",
    status: "Cache Ingested",
  },
];

export function GlobalDashboard() {
  const [activeFilter, setActiveFilter] = useState("all");

  const filteredDatasets = DATASETS.filter((d) => {
    if (activeFilter === "all") return true;
    return d.category === activeFilter;
  });

  return (
    <div className="globalPageContainer">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Earth Observation & Geospatial Registry
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
            Active satellite observation grids, elevation models, and spatial data feeds powering InfraDrishti calculations.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={12} />
            EPSG:32643 (UTM 43N) Validated
          </span>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="globalKpiGrid">
        <div className="globalKpiCard" style={{ borderTop: '3px solid #2563eb' }}>
          <div className="globalKpiTop">
            <span className="globalKpiLabel">Active Feeds</span>
            <Database size={15} color="#2563eb" />
          </div>
          <div className="globalKpiValue">7 Verified Sources</div>
          <div className="globalKpiSub">100% pre-processed into local raster cache</div>
        </div>

        <div className="globalKpiCard" style={{ borderTop: '3px solid #059669' }}>
          <div className="globalKpiTop">
            <span className="globalKpiLabel">Native Grid Grid</span>
            <Layers size={15} color="#059669" />
          </div>
          <div className="globalKpiValue">50-Meter Cell</div>
          <div className="globalKpiSub">Harmonized multi-source spatial resolution</div>
        </div>

        <div className="globalKpiCard" style={{ borderTop: '3px solid #d97706' }}>
          <div className="globalKpiTop">
            <span className="globalKpiLabel">Validated AOI Extent</span>
            <MapPin size={15} color="#d97706" />
          </div>
          <div className="globalKpiValue">Latur — Osmanabad</div>
          <div className="globalKpiSub">Lon 75.80°–76.81°, Lat 17.89°–18.61°</div>
        </div>

        <div className="globalKpiCard" style={{ borderTop: '3px solid #7c3aed' }}>
          <div className="globalKpiTop">
            <span className="globalKpiLabel">Projection Standard</span>
            <Globe size={15} color="#7c3aed" />
          </div>
          <div className="globalKpiValue">UTM Zone 43N</div>
          <div className="globalKpiSub">WGS 84 metric cartographic projection</div>
        </div>
      </div>

      {/* Two Column Layout: Table + Architecture Sidebar */}
      <div className="globalMainSplit">
        {/* Left Column: Data Catalog Table */}
        <div className="globalTableCard">
          <div className="globalCardHeader">
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
              Ingested Satellite & Geospatial Layers ({filteredDatasets.length})
            </span>

            {/* Category Filter Pills */}
            <div className="globalFilterGroup">
              {[
                ["all", "All Feeds"],
                ["terrain", "Terrain & Hydro"],
                ["ecology", "Ecology & Land Cover"],
                ["demographics", "Demographics & Roads"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`globalFilterBtn ${activeFilter === key ? "active" : ""}`}
                  onClick={() => setActiveFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Dataset</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Provider</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Resolution</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Processing Role</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Ingestion Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDatasets.map((d) => {
                const Icon = d.icon;
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          background: `${d.iconColor}14`,
                          color: d.iconColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Icon size={14} />
                        </div>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{d.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className="globalProviderPill">{d.provider}</span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#475569', fontFamily: 'monospace' }}>
                      {d.resolution}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b', maxWidth: '240px', lineHeight: 1.4 }}>
                      {d.purpose}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className="globalStatusPill">
                        <CheckCircle2 size={10} />
                        {d.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Column: Processing Engine Architecture */}
        <div className="globalSideCard">
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
            Data Pipeline Architecture
          </div>

          <div className="globalArchRow">
            <div className="globalArchIconBox">
              <Layers size={14} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>Unified 50m Raster Grid</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.45 }}>
                All input raster and vector datasets are reprojected and resampled to a standardized 50-meter cell size in EPSG:32643 to eliminate distortion across elevation and distance calculations.
              </div>
            </div>
          </div>

          <div className="globalArchRow">
            <div className="globalArchIconBox">
              <HardDrive size={14} color="#059669" />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>Local GeoTIFF Ingestion Cache</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.45 }}>
                Rasters are pre-indexed into a high-throughput cache. Spatial queries execute via direct memory mapping rather than external API calls, providing consistent low-latency routing.
              </div>
            </div>
          </div>

          <div className="globalArchRow">
            <div className="globalArchIconBox">
              <ShieldCheck size={14} color="#d97706" />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>Coverage Guard & Audit Trail</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.45 }}>
                Analysis requests outside the validated coverage envelope trigger a <code>DATA_COVERAGE_BLOCKER</code>. Completed calculations attach cryptographic provenance hashes to ensure auditability.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}