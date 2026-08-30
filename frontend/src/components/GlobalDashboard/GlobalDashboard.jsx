import React, { useEffect, useRef, useState } from "react";
import { Globe, Shield, Satellite, Map, Activity, Zap, Radio, Target } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const ESRI_SATELLITE_STYLE = {
  version: 8,
  sources: {
    "esri-sat": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "© Esri"
    },
    "esri-labels": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256
    }
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#020609" } },
    { id: "sat-layer", type: "raster", source: "esri-sat", minzoom: 0, maxzoom: 22 },
    { id: "labels-layer", type: "raster", source: "esri-labels", minzoom: 0, maxzoom: 22 }
  ]
};

const GLOBAL_NODES = [
  { name: "Washington DC Command", coords: [-77.0369, 38.9072], status: "ACTIVE" },
  { name: "London Node", coords: [-0.1276, 51.5072], status: "ACTIVE" },
  { name: "Tokyo Uplink", coords: [139.6917, 35.6895], status: "ACTIVE" },
  { name: "Sydney Array", coords: [151.2093, -33.8688], status: "ACTIVE" },
  { name: "Johannesburg Relay", coords: [28.0473, -26.2041], status: "STANDBY" },
  { name: "São Paulo Hub", coords: [-46.6333, -23.5505], status: "ACTIVE" },
  { name: "Delhi Primary", coords: [77.2090, 28.6139], status: "MASTER" },
];

export function GlobalDashboard() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: ESRI_SATELLITE_STYLE,
      center: [15, 20],
      zoom: 2.2,
      pitch: 0,
      bearing: 0,
      antialias: true
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);

      // Add Global Nodes Source
      map.addSource("global-nodes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: GLOBAL_NODES.map(n => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: n.coords },
            properties: { name: n.name, status: n.status }
          }))
        }
      });

      // Add glowing circles for nodes
      map.addLayer({
        id: "global-nodes-glow",
        type: "circle",
        source: "global-nodes",
        paint: {
          "circle-radius": [
            "match",
            ["get", "status"],
            "MASTER", 15,
            "ACTIVE", 10,
            6
          ],
          "circle-color": [
            "match",
            ["get", "status"],
            "MASTER", "#00f0ff",
            "ACTIVE", "#10b981",
            "#f59e0b"
          ],
          "circle-opacity": 0.4,
          "circle-blur": 1
        }
      });

      map.addLayer({
        id: "global-nodes-core",
        type: "circle",
        source: "global-nodes",
        paint: {
          "circle-radius": [
            "match",
            ["get", "status"],
            "MASTER", 6,
            "ACTIVE", 4,
            3
          ],
          "circle-color": "#ffffff"
        }
      });
      
      // Add lines connecting nodes to Delhi Primary
      const delhiCoords = GLOBAL_NODES.find(n => n.status === "MASTER").coords;
      const arcFeatures = GLOBAL_NODES.filter(n => n.status !== "MASTER").map(n => {
        return {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [delhiCoords, n.coords]
          }
        };
      });

      map.addSource("global-arcs", {
        type: "geojson",
        data: { type: "FeatureCollection", features: arcFeatures }
      });

      map.addLayer({
        id: "global-arcs-line",
        type: "line",
        source: "global-arcs",
        paint: {
          "line-color": "#00f0ff",
          "line-width": 1.5,
          "line-opacity": 0.3,
          "line-dasharray": [2, 2]
        }
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="plannerGrid" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Top Stats Row */}
      <div style={{ display: 'flex', gap: '15px', padding: '15px', background: 'rgba(4, 12, 19, 0.95)', borderBottom: '1px solid rgba(0, 240, 255, 0.1)', zIndex: 10 }}>
        
        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(0, 240, 255, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Satellite size={24} color="#00f0ff" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>SATELLITE DOWNLINKS</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>14 Active</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Map size={24} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>TERRAIN TILES SYNCED</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>2.4M</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Shield size={24} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>GLOBAL RISK INDEX</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>NOMINAL</div>
          </div>
        </div>

        <div className="evalCard" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '8px' }}>
            <Globe size={24} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#8daea8', letterSpacing: '1px' }}>INTERNATIONAL NODES</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#e2f1f5' }}>48 Linked</div>
          </div>
        </div>

      </div>

      {/* Main Content Area - Fullscreen Map Background */}
      <div style={{ position: 'relative', flex: 1, width: '100%', height: '100%', background: '#020609' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
        
        {/* Map Overlay UI */}
        <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: 'rgba(2, 6, 9, 0.85)', backdropFilter: 'blur(10px)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.2)', width: '300px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#00f0ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={14} /> LIVE ORBITAL TELEMETRY
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', color: '#e2f1f5' }}>
              <span>ESA Copernicus</span>
              <span style={{ color: '#10b981' }}>Nominal (24ms)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', color: '#e2f1f5' }}>
              <span>NASA SRTM Array</span>
              <span style={{ color: '#10b981' }}>Active (18ms)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#e2f1f5' }}>
              <span>JAXA ALOS-2</span>
              <span style={{ color: '#f59e0b' }}>Standby</span>
            </div>
          </div>
          
          <div style={{ background: 'rgba(2, 6, 9, 0.85)', backdropFilter: 'blur(10px)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.2)', width: '300px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#00f0ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={14} /> STRATEGIC NODE STATUS
            </h3>
            {GLOBAL_NODES.map(node => (
              <div key={node.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px', color: '#8daea8' }}>
                <span>{node.name}</span>
                <span style={{ color: node.status === 'MASTER' ? '#00f0ff' : (node.status === 'ACTIVE' ? '#10b981' : '#f59e0b') }}>
                  {node.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          <div style={{ background: 'rgba(2, 6, 9, 0.7)', border: '1px solid rgba(0, 240, 255, 0.3)', padding: '10px 20px', borderRadius: '20px', color: '#00f0ff', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 15px rgba(0, 240, 255, 0.1)' }}>
             <Activity size={16} /> GLOBAL SYNCHRONIZATION ESTABLISHED
          </div>
        </div>

      </div>
    </div>
  );
}
