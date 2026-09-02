import { Database, Boxes, GitBranch, ShieldCheck, Map as MapIcon } from "lucide-react";

// Honest project-intelligence summary. No fabricated telemetry, no government
// identity, no fake compute clusters.
export function ProjectIntelligenceMenu() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px', color: '#334155', lineHeight: 1.5 }}>
      <Section icon={<GitBranch size={14} />} title="Architecture">
        React (MapLibre) frontend → FastAPI backend → raster GIS engine (NumPy/Scipy/scikit-image/rasterio) →
        least-cost corridor engine (MCP_Geometric) / contiguous site finder (watershed) → canonical MCDA →
        deterministic explanation → GeoJSON (EPSG:4326).
      </Section>

      <Section icon={<Boxes size={14} />} title="Analytical Modules">
        Corridor planner and site finder. Both use the same MCDA and explanation engine
        (single source of truth) over validated pre-processed rasters.
      </Section>

      <Section icon={<MapIcon size={14} />} title="Geographic Coverage">
        Validated data cache covers approximately lon 75.80–76.81, lat 17.89–18.61
        (Latur–Osmanabad, Maharashtra) at 50 m resolution. Requests outside this AOI
        return a truthful DATA_COVERAGE_BLOCKER; no geographically incorrect data is substituted.
      </Section>

      <Section icon={<Database size={14} />} title="Datasets">
        Copernicus DEM, ESA WorldCover (land cover), WorldPop (population), JRC Global
        Surface Water, HydroRIVERS (rivers), WDPA (protected areas), OSM (highways).
        Provenance is attached to every completed analysis.
      </Section>

      <Section icon={<ShieldCheck size={14} />} title="Authentication">
        Demo Mode — no accounts, login, permissions, or persistent identity.
      </Section>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: '#64748b' }}>
        This platform is a spatial planning / screening decision-support tool. It is not an
        engineering-design, environmental-clearance, cadastral-ownership, or acquisition-probability system.
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
        {icon} {title}
      </div>
      <div>{children}</div>
    </div>
  );
}