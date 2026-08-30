import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as turf from "@turf/turf";
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2,
  Crosshair, Layers, Sparkles, CheckCircle2, Award
} from "lucide-react";

import indiaBoundaryRaw   from "../data/indiaBoundary.json";
import indiaStatesRaw     from "../data/indiaStates.json";
import waterData          from "../data/water.json";
import landcoverData      from "../data/landcover.json";
import constraintsData    from "../data/constraints.json";
import buildingsData      from "../data/buildings.json";

/* ═══════════════════════════════════════════════════════════
   MAP STYLE — Satellite base (free, ESRI, no API key)
═══════════════════════════════════════════════════════════ */
const SATELLITE_BASE_STYLE = {
  version: 8,
  sources: {
    "esri-sat": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "� Esri"
    },
    "esri-labels": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256
    },
    "terrain-source": {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256
    }
  },
  terrain: {
    source: "terrain-source",
    exaggeration: 1.5
  },
  layers: [
    { id: "sat-base", type: "raster", source: "esri-sat", minzoom: 0, maxzoom: 20 },
    { id: "sat-labels", type: "raster", source: "esri-labels", minzoom: 0, maxzoom: 20, paint: { "raster-opacity": 0.85 } }
  ]
};

/* ═══════════════════════════════════════════════════════════
   INDIA BOUNDARY — extract polygon coordinates from data file
═══════════════════════════════════════════════════════════ */
const INDIA_FC = indiaBoundaryRaw.indiaBorder;
const INDIA_COORDS = INDIA_FC.features[0].geometry.coordinates[0]; // outer ring

/* World-minus-India mask polygon (dark overlay outside India) */
const WORLD_MASK_FC = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        // World outer ring (counter-clockwise, Web Mercator safe limits)
        [[-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]],
        // India hole — same ring but reversed (makes the cutout)
        [...INDIA_COORDS].reverse()
      ]
    }
  }]
};

const STATES_FC = indiaStatesRaw.statesGeoJSON;

/* ═══════════════════════════════════════════════════════════
   RIVER / CANAL LINESTRINGS — demo data for rivers
═══════════════════════════════════════════════════════════ */
const RIVERS_FC = {
  type: "FeatureCollection",
  features: [
    // Yamuna river path
    { type: "Feature", properties: { name: "Yamuna", category: "Major River" },
      geometry: { type: "LineString", coordinates: [
        [77.18, 30.5],[77.2, 29.9],[77.25, 29.3],[77.28, 28.75],[77.26, 28.55],
        [77.42, 28.25],[77.55, 27.95],[77.68, 27.75],[77.72, 27.5],
        [77.66, 27.15],[77.55, 26.8]
      ]}
    },
    // Chambal river
    { type: "Feature", properties: { name: "Chambal", category: "Major River" },
      geometry: { type: "LineString", coordinates: [
        [75.0, 24.8],[75.3, 25.2],[75.6, 25.8],[75.9, 26.2],[76.15, 26.65],[76.4, 27.1],[76.6, 27.5]
      ]}
    },
    // Banas river
    { type: "Feature", properties: { name: "Banas", category: "Major River" },
      geometry: { type: "LineString", coordinates: [
        [73.5, 24.2],[73.9, 24.8],[74.3, 25.4],[74.8, 25.8],[75.2, 26.0],[75.6, 26.3]
      ]}
    },
    // Ghaggar river (Haryana)
    { type: "Feature", properties: { name: "Ghaggar", category: "Seasonal River" },
      geometry: { type: "LineString", coordinates: [
        [76.5, 30.6],[76.8, 30.0],[76.9, 29.4],[77.0, 28.9],[76.8, 28.5],[76.6, 28.1]
      ]}
    },
    // Luni river (Rajasthan)
    { type: "Feature", properties: { name: "Luni", category: "Major River" },
      geometry: { type: "LineString", coordinates: [
        [73.8, 25.8],[73.4, 25.4],[73.0, 25.0],[72.5, 24.7],[72.1, 24.4]
      ]}
    }
  ]
};

/* ═══════════════════════════════════════════════════════════
   WATER BODIES — lakes & reservoirs point markers
═══════════════════════════════════════════════════════════ */
const WATER_POINTS_FC = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Sambhar Lake", type: "lake" }, geometry: { type: "Point", coordinates: [74.97, 26.91] } },
    { type: "Feature", properties: { name: "Pichola Lake", type: "lake" }, geometry: { type: "Point", coordinates: [73.68, 24.58] } },
    { type: "Feature", properties: { name: "Pushkar Lake", type: "lake" }, geometry: { type: "Point", coordinates: [74.55, 26.49] } },
    { type: "Feature", properties: { name: "Jawai Dam", type: "reservoir" }, geometry: { type: "Point", coordinates: [73.41, 25.35] } },
    { type: "Feature", properties: { name: "Bisalpur Dam", type: "reservoir" }, geometry: { type: "Point", coordinates: [75.73, 25.93] } },
    { type: "Feature", properties: { name: "Nahargarh Reservoir", type: "reservoir" }, geometry: { type: "Point", coordinates: [75.78, 27.00] } },
    { type: "Feature", properties: { name: "Yamuna Floodplain", type: "floodplain" }, geometry: { type: "Point", coordinates: [77.35, 28.65] } },
    { type: "Feature", properties: { name: "Badkhal Lake", type: "lake" }, geometry: { type: "Point", coordinates: [77.31, 28.42] } }
  ]
};

/* ═══════════════════════════════════════════════════════════
   WILDLIFE / FOREST AREAS
═══════════════════════════════════════════════════════════ */
const WILDLIFE_POINTS_FC = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Sariska Tiger Reserve", type: "tiger_reserve" }, geometry: { type: "Point", coordinates: [76.43, 27.36] } },
    { type: "Feature", properties: { name: "Ranthambore NP", type: "national_park" }, geometry: { type: "Point", coordinates: [76.5, 26.02] } },
    { type: "Feature", properties: { name: "Keoladeo NP (Bharatpur)", type: "national_park" }, geometry: { type: "Point", coordinates: [77.52, 27.17] } },
    { type: "Feature", properties: { name: "Sultanpur Bird Sanctuary", type: "sanctuary" }, geometry: { type: "Point", coordinates: [76.88, 28.43] } },
    { type: "Feature", properties: { name: "Aravalli Biodiversity Reserve", type: "reserve" }, geometry: { type: "Point", coordinates: [76.98, 28.35] } },
    { type: "Feature", properties: { name: "Nahargarh Sanctuary", type: "sanctuary" }, geometry: { type: "Point", coordinates: [75.72, 26.97] } }
  ]
};

/* ═══════════════════════════════════════════════════════════
   MAJOR CITIES
═══════════════════════════════════════════════════════════ */
const CITIES_FC = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Delhi NCR", size: "major" }, geometry: { type: "Point", coordinates: [77.209, 28.6139] } },
    { type: "Feature", properties: { name: "Jaipur", size: "major" }, geometry: { type: "Point", coordinates: [75.7873, 26.9124] } },
    { type: "Feature", properties: { name: "Gurugram", size: "city" }, geometry: { type: "Point", coordinates: [77.0266, 28.4595] } },
    { type: "Feature", properties: { name: "Rewari", size: "town" }, geometry: { type: "Point", coordinates: [76.619, 28.198] } },
    { type: "Feature", properties: { name: "Neemrana", size: "town" }, geometry: { type: "Point", coordinates: [76.3812, 27.9945] } },
    { type: "Feature", properties: { name: "Alwar", size: "city" }, geometry: { type: "Point", coordinates: [76.608, 27.554] } },
    { type: "Feature", properties: { name: "Behror", size: "town" }, geometry: { type: "Point", coordinates: [76.29, 27.9] } },
    { type: "Feature", properties: { name: "Kotputli", size: "town" }, geometry: { type: "Point", coordinates: [76.2, 27.70] } },
    { type: "Feature", properties: { name: "Shahpura", size: "town" }, geometry: { type: "Point", coordinates: [75.97, 27.39] } }
  ]
};

/* ═══════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════ */
export function InteractiveMap({
  origin, destination, routesGeoJSON, scoredRoutes,
  selectedRouteId, onSelectRoute,
  constraintsGeoJSON, buildingsGeoJSON, waterGeoJSON, landcoverGeoJSON,
  hardConstraints, activeMode, setActiveMode, isDemoData, enable3D, renderCorridors, bufferRadius = 5 }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const originMarkerRef = useRef(null);
  const destMarkerRef   = useRef(null);
  const animFrameRef    = useRef(null);

  const [mapLoaded,    setMapLoaded]    = useState(false);
  const [mapError,     setMapError]     = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBuffer,   setShowBuffer]   = useState(true);
  const [is3D,         setIs3D]         = useState(false);
  const [activeLayer,  setActiveLayer]  = useState("ALL");

  useEffect(() => {
    if (enable3D !== undefined && mapRef.current) {
      setIs3D(enable3D);
      mapRef.current.easeTo({ pitch: enable3D ? 45 : 0, bearing: enable3D ? -12 : 0, duration: 1000 });
    }
  }, [enable3D]);

  useEffect(() => {
    if (renderCorridors !== undefined) setShowBuffer(renderCorridors);
  }, [renderCorridors]);

  const topScore = scoredRoutes?.length > 0 ? scoredRoutes[0].score : 78;

  /* ─── Add all GIS layers to the map ─── */
  const addAllLayers = useCallback((map) => {
    try {
      /* ── SOURCES ── */
      const addSrc = (id, data) => {
        if (!map.getSource(id)) map.addSource(id, { type: "geojson", data });
      };

      addSrc("world-mask-src",    WORLD_MASK_FC);
      addSrc("india-boundary-src", INDIA_FC);
      addSrc("india-states-src",  STATES_FC);
      addSrc("rivers-src",        RIVERS_FC);
      addSrc("water-bodies-src",  waterGeoJSON  || waterData);
      addSrc("water-points-src",  WATER_POINTS_FC);
      addSrc("wildlife-src",      WILDLIFE_POINTS_FC);
      addSrc("landcover-src",     landcoverGeoJSON || landcoverData);
      addSrc("constraints-src",   constraintsGeoJSON || constraintsData);
      addSrc("buildings-src",     buildingsGeoJSON   || buildingsData);
      addSrc("cities-src",        CITIES_FC);
      addSrc("buffer-src",        { type: "FeatureCollection", features: [] });
      addSrc("routes-src",        routesGeoJSON || { type: "FeatureCollection", features: [] });

      /* ══════════════════════════════════
         LAYER ORDER (bottom → top)
      ═══════════════════════════════════ */

      /* 1. WORLD DARK MASK — everything outside India becomes dark */
      map.addLayer({
        id: "world-dark-mask", type: "fill", source: "world-mask-src",
        paint: {
          "fill-color": "#0a0f14",
          "fill-opacity": 0.88
        }
      });

      /* 2. Landcover (forest / agriculture) — inside India */
      map.addLayer({
        id: "landcover-layer", type: "fill", source: "landcover-src",
        paint: {
          "fill-color": [
            "match", ["get", "category"],
            "Forest",      "#1a5c2a",
            "Agriculture", "#4a7c32",
            "#2e5016"
          ],
          "fill-opacity": 0.45
        }
      });

      /* 3. Water bodies (polygon) */
      map.addLayer({
        id: "water-poly-layer", type: "fill", source: "water-bodies-src",
        paint: {
          "fill-color": "#0ea5e9",
          "fill-opacity": 0.55
        }
      });
      map.addLayer({
        id: "water-poly-outline", type: "line", source: "water-bodies-src",
        paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.8 }
      });

      /* 4. Constraints / Protected areas */
      map.addLayer({
        id: "constraints-fill", type: "fill", source: "constraints-src",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.35
        }
      });
      map.addLayer({
        id: "constraints-outline", type: "line", source: "constraints-src",
        paint: { "line-color": "#ef4444", "line-width": 1.5, "line-dasharray": [3, 2], "line-opacity": 0.8 }
      });

      /* 5. Buildings / Urban */
      map.addLayer({
        id: "buildings-layer", type: "fill", source: "buildings-src",
        paint: { "fill-color": "#d97706", "fill-opacity": 0.35, "fill-outline-color": "#f59e0b" }
      });

      /* 6. Rivers — glowing cyan lines */
      map.addLayer({
        id: "rivers-glow", type: "line", source: "rivers-src",
        paint: {
          "line-color": "#00b4d8",
          "line-width": ["case", ["==", ["get", "category"], "Major River"], 8, 4],
          "line-opacity": 0.35,
          "line-blur": 4
        }
      });
      map.addLayer({
        id: "rivers-line", type: "line", source: "rivers-src",
        paint: {
          "line-color": ["case",
            ["==", ["get", "category"], "Major River"], "#00d4ff",
            "#48cae4"
          ],
          "line-width": ["case", ["==", ["get", "category"], "Major River"], 3, 1.5],
          "line-opacity": 0.9
        }
      });

      /* 7. State boundary lines */
      map.addLayer({
        id: "state-boundaries", type: "line", source: "india-states-src",
        paint: {
          "line-color": "#00f0ff",
          "line-width": 0.8,
          "line-opacity": 0.4,
          "line-dasharray": [4, 3]
        }
      });

      /* 8. India national boundary — GLOW + LINE */
      map.addLayer({
        id: "india-glow-outer", type: "line", source: "india-boundary-src",
        paint: {
          "line-color": "#00f0ff",
          "line-width": 20,
          "line-opacity": 0.08,
          "line-blur": 12
        }
      });
      map.addLayer({
        id: "india-glow-mid", type: "line", source: "india-boundary-src",
        paint: {
          "line-color": "#00f0ff",
          "line-width": 8,
          "line-opacity": 0.25,
          "line-blur": 5
        }
      });
      map.addLayer({
        id: "india-boundary-line", type: "line", source: "india-boundary-src",
        paint: {
          "line-color": "#00f0ff",
          "line-width": 2,
          "line-opacity": 0.95,
          "line-dasharray": [6, 3]
        }
      });

      /* 9. Analysis buffer */
      map.addLayer({
        id: "buffer-fill", type: "fill", source: "buffer-src",
        paint: { "fill-color": "#00f0ff", "fill-opacity": 0.08 }
      });
      map.addLayer({
        id: "buffer-outline", type: "line", source: "buffer-src",
        paint: { "line-color": "#00f0ff", "line-width": 1, "line-dasharray": [3, 3], "line-opacity": 0.5 }
      });

      /* 10. ROUTES — 3 layers each: dark casing → colour glow → main line */
      // Dark casing for contrast
      map.addLayer({
        id: "routes-casing", type: "line", source: "routes-src",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#000000",
          "line-width": ["case", ["==", ["get", "id"], selectedRouteId], 18, 12],
          "line-opacity": 0.7
        }
      });
      // Glow halo
      map.addLayer({
        id: "routes-glow", type: "line", source: "routes-src",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#3b82f6"],
          "line-width": ["case", ["==", ["get", "id"], selectedRouteId], 28, 18],
          "line-opacity": 0.45,
          "line-blur": 10
        }
      });

      /* 9. Site Candidate Polygons (If routes-src contains polygons) */
      map.addLayer({
        id: "site-polygons",
        type: "fill",
        source: "routes-src",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "id"], selectedRouteId],
            "#00f0ff", // selected site cyan
            "#3b82f6"  // other sites blue
          ],
          "fill-opacity": [
            "case",
            ["==", ["get", "id"], selectedRouteId],
            0.5,
            0.2
          ],
          "fill-outline-color": "#00f0ff"
        }
      });
      map.addLayer({
        id: "site-polygons-line",
        type: "line",
        source: "routes-src",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "id"], selectedRouteId],
            "#00f0ff",
            "#60a5fa"
          ],
          "line-width": [
            "case",
            ["==", ["get", "id"], selectedRouteId],
            3,
            1
          ]
        }
      });

      /* 10. Route Points/Markers (Existing logic) */
      map.addLayer({
        id: "route-points",
        type: "circle",
        source: "routes-src",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-color": ["coalesce", ["get", "color"], "#3b82f6"],
          "circle-radius": ["case", ["==", ["get", "id"], selectedRouteId], 8, 5],
          "circle-opacity": 1
        }
      });
      // Main line
      map.addLayer({
        id: "routes-lines", type: "line", source: "routes-src",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#3b82f6"],
          "line-width": ["case", ["==", ["get", "id"], selectedRouteId], 7, 4],
          "line-opacity": 1
        }
      });

      /* 11. Water body POINTS (lakes, reservoirs) */
      map.addLayer({
        id: "water-points-glow", type: "circle", source: "water-points-src",
        paint: {
          "circle-radius": 10,
          "circle-color": "#0ea5e9",
          "circle-opacity": 0.2,
          "circle-blur": 1
        }
      });
      map.addLayer({
        id: "water-points-dot", type: "circle", source: "water-points-src",
        paint: {
          "circle-radius": 5,
          "circle-color": "#38bdf8",
          "circle-stroke-color": "#00d4ff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9
        },
        minzoom: 6
      });

      /* 12. Wildlife / forest POINTS */
      map.addLayer({
        id: "wildlife-glow", type: "circle", source: "wildlife-src",
        paint: {
          "circle-radius": 14,
          "circle-color": "#22c55e",
          "circle-opacity": 0.15,
          "circle-blur": 1.5
        },
        minzoom: 5
      });
      map.addLayer({
        id: "wildlife-dot", type: "circle", source: "wildlife-src",
        paint: {
          "circle-radius": 6,
          "circle-color": "#4ade80",
          "circle-stroke-color": "#22c55e",
          "circle-stroke-width": 2,
          "circle-opacity": 0.9
        },
        minzoom: 5
      });

      /* 13. Cities */
      map.addLayer({
        id: "cities-layer", type: "circle", source: "cities-src",
        minzoom: 6,
        paint: {
          "circle-radius": ["case",
            ["==", ["get", "size"], "major"], 5,
            ["==", ["get", "size"], "city"], 3.5,
            2.5
          ],
          "circle-color": "#e2f1f5",
          "circle-stroke-color": "#00f0ff",
          "circle-stroke-width": 1,
          "circle-opacity": 0.85
        }
      });

      /* Route click handler */
      map.on("click", "routes-lines", (e) => {
        if (e.features?.[0]) onSelectRoute(e.features[0].properties.id);
      });
      map.on("mouseenter", "routes-lines", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "routes-lines", () => { map.getCanvas().style.cursor = ""; });
    } catch (err) {
      console.error("Map layer error:", err);
      setMapError(err.toString());
    }
  }, [waterGeoJSON, landcoverGeoJSON, constraintsGeoJSON, buildingsGeoJSON, routesGeoJSON, selectedRouteId, onSelectRoute]);

  /* ─── Create glowing animated HTML markers ─── */
  const createMarker = (type, cityName) => {
    const el = document.createElement("div");
    el.className = `gisMarker ${type === "origin" ? "originGisMarker" : "destGisMarker"}`;
    el.innerHTML = `
      <div class="gisMarkerRing ring1"></div>
      <div class="gisMarkerRing ring2"></div>
      <div class="gisMarkerCore"></div>
      <div class="gisMarkerLabel">
        <span class="gisMarkerTag">${type === "origin" ? "ORIGIN" : "DESTINATION"}</span>
        <strong class="gisMarkerCity" id="marker-name-${type}">${cityName}</strong>
      </div>
    `;
    return el;
  };

  /* ─── Initialize map ─── */
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: SATELLITE_BASE_STYLE,
      center: [76.5, 27.75], // Northern India center
      zoom: 6.5,
      minZoom: 4,
      maxZoom: 18,
      pitch: 0,
      bearing: 0
    });

    mapRef.current = map;

    map.on("load", () => {
      addAllLayers(map);
      setMapLoaded(true);
    });

    map.on("error", (e) => {
      console.error("MapLibre Async Error:", e);
      if (e.error) setMapError(prev => (prev ? prev + "\n" + e.error.message : e.error.message));
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        originMarkerRef.current = null;
        destMarkerRef.current = null;
      }
    };
  }, []); // eslint-disable-line

  /* ─── Markers ─── */
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    if (origin) {
      if (!originMarkerRef.current) {
        const el = createMarker("origin", origin.name);
        originMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(origin.coords)
          .addTo(mapRef.current);
      } else {
        originMarkerRef.current.setLngLat(origin.coords);
        const nameEl = originMarkerRef.current.getElement().querySelector('#marker-name-origin');
        if (nameEl) nameEl.textContent = origin.name.toUpperCase();
      }
    } else if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }

    if (destination) {
      if (!destMarkerRef.current) {
        const el = createMarker("destination", destination.name);
        destMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(destination.coords)
          .addTo(mapRef.current);
      } else {
        destMarkerRef.current.setLngLat(destination.coords);
        const nameEl = destMarkerRef.current.getElement().querySelector('#marker-name-destination');
        if (nameEl) nameEl.textContent = destination.name.toUpperCase();
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
  }, [origin, destination, mapLoaded]);

  /* ─── Update data sources ─── */
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    if (routesGeoJSON && mapRef.current.getSource("routes-src")) {
      mapRef.current.getSource("routes-src").setData(routesGeoJSON);
      
      // Auto-fit to new route bounds
      try {
        mapRef.current.fitBounds(turf.bbox(routesGeoJSON), { padding: 80, maxZoom: 11, duration: 1500 });
      } catch (e) {}
    }

    // Buffer
    if (mapRef.current.getSource("buffer-src")) {
      const activeScore = scoredRoutes?.find((sr) => sr.id === selectedRouteId);
      const bufferData = showBuffer && activeScore?.bufferGeoJSON
        ? { type: "FeatureCollection", features: [activeScore.bufferGeoJSON] }
        : { type: "FeatureCollection", features: [] };
      mapRef.current.getSource("buffer-src").setData(bufferData);
    }

    // Update route widths for selected
    const setP = (layerId, prop, val) => {
      if (mapRef.current.getLayer(layerId))
        mapRef.current.setPaintProperty(layerId, prop, val);
    };

    setP("routes-glow",   "line-width",   ["case", ["==", ["get", "id"], selectedRouteId], 28, 16]);
    setP("routes-glow",   "line-opacity", ["case", ["==", ["get", "id"], selectedRouteId], 0.6, 0.3]);
    setP("routes-casing", "line-width",   ["case", ["==", ["get", "id"], selectedRouteId], 18, 10]);
    setP("routes-lines",  "line-width",   ["case", ["==", ["get", "id"], selectedRouteId], 7, 4]);
  }, [routesGeoJSON, scoredRoutes, selectedRouteId, showBuffer, bufferRadius, mapLoaded]);

  /* ─── Layer visibility by mode ─── */
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const vis = (id, show) => {
      if (mapRef.current.getLayer(id))
        mapRef.current.setLayoutProperty(id, "visibility", show ? "visible" : "none");
    };
    const all = true;
    if (activeMode === "ROUTE ANALYSIS") {
      vis("water-poly-layer", hardConstraints.avoidWater);
      vis("water-poly-outline", hardConstraints.avoidWater);
      vis("landcover-layer", hardConstraints.avoidForest);
      vis("buildings-layer", hardConstraints.avoidBuildings);
      vis("constraints-fill", all); vis("constraints-outline", all);
      vis("buffer-fill", showBuffer); vis("buffer-outline", showBuffer);
    } else if (activeMode === "TERRAIN") {
      vis("water-poly-layer", all); vis("water-poly-outline", all);
      vis("landcover-layer", all); vis("buildings-layer", false);
      vis("constraints-fill", all); vis("constraints-outline", all);
      vis("buffer-fill", false); vis("buffer-outline", false);
    } else if (activeMode === "LAND COVER") {
      vis("water-poly-layer", all); vis("water-poly-outline", all);
      vis("landcover-layer", all); vis("buildings-layer", false);
      vis("constraints-fill", false); vis("constraints-outline", false);
      vis("buffer-fill", false); vis("buffer-outline", false);
    } else if (activeMode === "EXPOSURE") {
      vis("water-poly-layer", false); vis("water-poly-outline", false);
      vis("landcover-layer", false); vis("buildings-layer", all);
      vis("constraints-fill", all); vis("constraints-outline", all);
      vis("buffer-fill", all); vis("buffer-outline", all);
    }
  }, [activeMode, hardConstraints, showBuffer, bufferRadius, mapLoaded]);

  /* ─── Refit to route ─── */
  const handleFitRoute = () => {
    if (!mapRef.current) return;
    try {
      const sel = routesGeoJSON?.features?.find(f => f.properties.id === selectedRouteId);
      const bounds = sel ? turf.bbox(sel) : routesGeoJSON ? turf.bbox(routesGeoJSON) : null;
      if (bounds) mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 11 });
    } catch (e) {}
  };

  const toggle3D = () => {
    if (!mapRef.current) return;
    const next = !is3D;
    setIs3D(next);
    mapRef.current.easeTo({ pitch: next ? 45 : 0, bearing: next ? -12 : 0, duration: 1000 });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(p => !p);
    setTimeout(() => mapRef.current?.resize(), 200);
  };

  /* ─── Layer toggle panel ─── */
  const LAYER_TOGGLES = [
    { key: "WATER",     label: "Water",     emoji: "💧", layers: ["water-poly-layer","water-poly-outline","water-points-glow","water-points-dot","rivers-glow","rivers-line"] },
    { key: "WILDLIFE",  label: "Wildlife",  emoji: "🌿", layers: ["wildlife-glow","wildlife-dot","landcover-layer"] },
    { key: "CITIES",    label: "Cities",    emoji: "🏙️", layers: ["cities-layer"] },
    { key: "ZONES",     label: "Zones",     emoji: "🚫", layers: ["constraints-fill","constraints-outline","buildings-layer"] },
    { key: "ROUTES",    label: "Routes",    emoji: "🛣️", layers: ["routes-casing","routes-glow","routes-lines","buffer-fill","buffer-outline"] }
  ];
  const [layerVis, setLayerVis] = useState({ WATER: true, WILDLIFE: true, CITIES: true, ZONES: true, ROUTES: true });

  const toggleLayerGroup = (key) => {
    const newVis = !layerVis[key];
    setLayerVis(p => ({ ...p, [key]: newVis }));
    if (!mapRef.current || !mapLoaded) return;
    const grp = LAYER_TOGGLES.find(t => t.key === key);
    grp?.layers.forEach(id => {
      if (mapRef.current.getLayer(id))
        mapRef.current.setLayoutProperty(id, "visibility", newVis ? "visible" : "none");
    });
  };

  return (
    <div className={`analysisMapContainer ${isFullscreen ? "fullscreenMap" : ""}`}>
      {/* TOP HEADER */}
      {activeMode !== "DASHBOARD" && (
        <div className="mapTopHeader">
          <div className="mapToolbarTabs">
            {["ROUTE ANALYSIS", "TERRAIN", "LAND COVER", "EXPOSURE"].map(mode => (
              <button key={mode}
                className={`mapModeTab ${activeMode === mode ? "active" : ""}`}
                onClick={() => setActiveMode(mode)}
              >{mode}</button>
            ))}
          </div>
          <div className="topKpiCards">
            <div className="kpiCard">
              <div className="kpiIcon cyanGlow"><CheckCircle2 size={13} /></div>
              <div><div className="kpiVal">2</div><div className="kpiLabel">FEASIBLE CORRIDORS</div></div>
            </div>
            <div className="kpiCard">
              <div className="kpiIcon blueGlow"><Layers size={13} /></div>
              <div><div className="kpiVal">7</div><div className="kpiLabel">SPATIAL FACTORS</div></div>
            </div>
            <div className="kpiCard">
              <div className="kpiIcon greenGlow"><Award size={13} /></div>
              <div><div className="kpiVal">1</div><div className="kpiLabel">OPTIMIZED CORRIDOR</div></div>
            </div>
            <div className="kpiCard purpleKpiCard">
              <div className="kpiIcon purpleGlow"><Sparkles size={13} /></div>
              <div>
                <div className="kpiVal purpleScoreVal">{topScore}<span>/100</span></div>
                <div className="kpiLabel">TOP SCORE</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAP CANVAS */}
      <div ref={mapContainerRef} className="mapLibreCanvas">

        {mapError && (
        <div style={{ position: 'absolute', top: '10%', left: '10%', right: '10%', background: 'rgba(255,0,0,0.9)', color: 'white', padding: '20px', zIndex: 9999, borderRadius: '8px', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '80%', overflow: 'auto' }}>
          <h3>Map Initialization Error</h3>
          <p>{mapError}</p>
        </div>
        )}
        {/* LAYER TOGGLE PANEL */}
        {activeMode !== "DASHBOARD" && (
          <div className="gisLayerPanel">
            <div className="gisLayerTitle">GIS LAYERS</div>
            {LAYER_TOGGLES.map(t => (
              <button key={t.key}
                className={`gisLayerBtn ${layerVis[t.key] ? "gisLayerOn" : "gisLayerOff"}`}
                onClick={() => toggleLayerGroup(t.key)}
              >
                <span className="gisLayerEmoji">{t.emoji}</span>
                <span className="gisLayerLabel">{t.label}</span>
                <span className="gisLayerToggleDot" />
              </button>
            ))}
          </div>
        )}

        {/* LEGEND */}
        {activeMode !== "DASHBOARD" && (
          <div className="gisLegend">
            <div className="gisLegendTitle">MAP LEGEND</div>
            <div className="gisLegendRow"><span className="gisLegendLine" style={{background:"#10b981",boxShadow:"0 0 8px #10b981"}}></span><span>Safest Feasible Route</span></div>
            <div className="gisLegendRow"><span className="gisLegendLine" style={{background:"#eab308",boxShadow:"0 0 8px #eab308"}}></span><span>Alternative Route</span></div>
            <div className="gisLegendRow"><span className="gisLegendLine" style={{background:"#ef4444",boxShadow:"0 0 6px #ef4444"}}></span><span>Infeasible / Impossible</span></div>
            <div className="gisLegendRow"><span className="gisLegendDot" style={{background:"#38bdf8"}}></span><span>Water Bodies / Rivers</span></div>
            <div className="gisLegendRow"><span className="gisLegendDot" style={{background:"#4ade80"}}></span><span>Wildlife / Forest</span></div>
            <div className="gisLegendRow"><span className="gisLegendDot" style={{background:"#ef4444"}}></span><span>Protected / Constrained</span></div>
            <div className="gisLegendRow"><span className="gisLegendDot" style={{background:"#00f0ff"}}></span><span>India Boundary</span></div>
          </div>
        )}

        {/* RIGHT CONTROLS */}
        {activeMode !== "DASHBOARD" && (
          <div className="mapControlsOverlay">
            <button onClick={() => mapRef.current?.zoomIn()} title="Zoom In"><ZoomIn size={14} /></button>
            <button onClick={() => mapRef.current?.zoomOut()} title="Zoom Out"><ZoomOut size={14} /></button>
            <button onClick={handleFitRoute} title="Fit to Route"><Crosshair size={14} /></button>
            <button onClick={toggle3D} className={is3D ? "activeControl" : ""} title="3D Tilt">3D</button>
            <button onClick={() => setShowBuffer(p => !p)} className={showBuffer ? "activeControl" : ""} title="Analysis Buffer"><Layers size={14} /></button>
            <button onClick={toggleFullscreen} title="Fullscreen">
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        )}

        <div className="mapScaleIndicator">100 km</div>
      </div>
    </div>
  );
}




