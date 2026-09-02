import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { Plus, Minus } from "lucide-react";

// Free, open-compatible base map (OpenFreeMap / OpenStreetMap-derived).
const BASE_STYLE = "https://tiles.openfreemap.org/styles/bright";

export const ROUTE_COLORS = {
  "R-1": "#2563eb", // Optimal — Vibrant Blue
  "R-2": "#10b981", // Alternative 1 — Emerald Green
  "R-3": "#8b5cf6", // Alternative 2 — Purple
  "R-4": "#f59e0b", // Alternative 3 — Amber
  "R-5": "#ec4899", // Alternative 4 — Rose
  "SITE-1": "#2563eb",
  "SITE-2": "#10b981",
  "SITE-3": "#8b5cf6",
  "SITE-4": "#f59e0b",
  "SITE-5": "#ec4899",
};

const ROUTE_COLOR_MATCH = [
  "match",
  ["get", "id"],
  "R-1", "#2563eb",
  "R-2", "#10b981",
  "R-3", "#8b5cf6",
  "R-4", "#f59e0b",
  "R-5", "#ec4899",
  "#2563eb"
];

const SITE_COLOR_MATCH = [
  "match",
  ["get", "id"],
  "SITE-1", "#2563eb",
  "SITE-2", "#10b981",
  "SITE-3", "#8b5cf6",
  "SITE-4", "#f59e0b",
  "SITE-5", "#ec4899",
  "#2563eb"
];

export function InteractiveMap({
  origin,
  destination,
  routesGeoJSON,
  selectedRouteId,
  onSelectRoute,
  bufferMeters = 0,
  isSiteMode = false,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const siteMarkersRef = useRef([]);
  const lastFittedRoutesRef = useRef(null);
  const lastSelectedSiteRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  const onSelectRouteRef = useRef(onSelectRoute);
  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  // Setup Base Sources and Layers safely (Runs strictly once on map load)
  const setupLayers = useCallback((map) => {
    try {
      // 1. Buffer Layer (translucent polygon below routes)
      if (!map.getSource("buffer-src")) {
        map.addSource("buffer-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer("buffer-fill")) {
        map.addLayer({
          id: "buffer-fill",
          type: "fill",
          source: "buffer-src",
          paint: { "fill-color": "#2563eb", "fill-opacity": 0.08 },
        });
      }
      if (!map.getLayer("buffer-outline")) {
        map.addLayer({
          id: "buffer-outline",
          type: "line",
          source: "buffer-src",
          paint: { "line-color": "#2563eb", "line-width": 1.5, "line-dasharray": [4, 2], "line-opacity": 0.6 },
        });
      }

      // 2. Direct distance baseline or AOI circle (pre-analysis reference)
      if (!map.getSource("baseline-src")) {
        map.addSource("baseline-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer("baseline-fill")) {
        map.addLayer({
          id: "baseline-fill",
          type: "fill",
          source: "baseline-src",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "fill-color": "#2563eb",
            "fill-opacity": 0.06,
          },
        });
      }
      if (!map.getLayer("baseline-line")) {
        map.addLayer({
          id: "baseline-line",
          type: "line",
          source: "baseline-src",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#2563eb",
            "line-width": 2,
            "line-dasharray": [4, 3],
            "line-opacity": 0.7,
          },
        });
      }

      // 3. Computed Features (Routes and Site Finder Polygons)
      if (!map.getSource("routes-src")) {
        map.addSource("routes-src", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }

      // 3a. Site Polygons (Site Finder Area Boundaries)
      if (!map.getLayer("sites-fill")) {
        map.addLayer({
          id: "sites-fill",
          type: "fill",
          source: "routes-src",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": SITE_COLOR_MATCH,
            "fill-opacity": 0.45,
          },
        });
      }
      if (!map.getLayer("sites-outline")) {
        map.addLayer({
          id: "sites-outline",
          type: "line",
          source: "routes-src",
          filter: ["==", ["geometry-type"], "Polygon"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": SITE_COLOR_MATCH,
            "line-width": 3.0,
          },
        });
      }

      // 3b. Corridor Route Lines (Corridor Planner)
      if (!map.getLayer("routes-casing")) {
        map.addLayer({
          id: "routes-casing",
          type: "line",
          source: "routes-src",
          filter: ["==", ["geometry-type"], "LineString"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#0f172a",
            "line-width": 8,
            "line-opacity": 0.85,
          },
        });
      }
      if (!map.getLayer("routes-lines")) {
        map.addLayer({
          id: "routes-lines",
          type: "line",
          source: "routes-src",
          filter: ["==", ["geometry-type"], "LineString"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ROUTE_COLOR_MATCH,
            "line-width": 5,
            "line-opacity": 1.0,
          },
        });
      }

      // Click and hover interactions for lines and site polygons
      map.on("click", "routes-lines", (e) => {
        const fid = e.features?.[0]?.properties?.id;
        if (fid && onSelectRouteRef.current) onSelectRouteRef.current(fid);
      });
      map.on("click", "sites-fill", (e) => {
        const fid = e.features?.[0]?.properties?.id;
        if (fid && onSelectRouteRef.current) onSelectRouteRef.current(fid);
      });
      map.on("mouseenter", "routes-lines", () => {
        if (map.getCanvas()) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "routes-lines", () => {
        if (map.getCanvas()) map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "sites-fill", () => {
        if (map.getCanvas()) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "sites-fill", () => {
        if (map.getCanvas()) map.getCanvas().style.cursor = "";
      });
    } catch (e) {
      console.warn("setupLayers error:", e);
    }
  }, []);

  const createMarker = (type, cityName) => {
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.gap = "8px";
    el.style.background = "rgba(255, 255, 255, 0.98)";
    el.style.padding = "5px 10px";
    el.style.borderRadius = "6px";
    el.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.16)";
    el.style.border = "1px solid #e2e8f0";
    el.style.fontSize = "12px";
    el.style.fontWeight = "600";
    el.style.color = "#0f172a";
    el.style.whiteSpace = "nowrap";

    const dot = document.createElement("span");
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "50%";
    dot.style.background = type === "origin" ? "#10b981" : "#ef4444";
    dot.style.boxShadow = type === "origin" ? "0 0 6px rgba(16,185,129,0.8)" : "0 0 6px rgba(239,68,68,0.8)";

    const text = document.createElement("span");
    text.textContent = cityName || (type === "origin" ? (isSiteMode ? "Search Region" : "Origin") : "Destination");

    el.appendChild(dot);
    el.appendChild(text);
    return el;
  };

  // Map Initialization: Runs strictly ONCE on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    try {
      const initialCenter = (origin && origin.coords) ? origin.coords : [76.5726, 18.4088];
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: BASE_STYLE,
        center: initialCenter,
        zoom: 9.5,
        minZoom: 4,
        maxZoom: 18,
      });
      mapRef.current = map;
      map.on("load", () => {
        setupLayers(map);
        try { map.resize(); } catch {}
        setMapLoaded(true);
      });
      map.on("error", (e) => {
        if (e.error) setMapError((p) => (p ? p + "\n" + e.error.message : e.error.message));
      });

      // Resize observer to ensure map canvas always matches parent container
      let ro = null;
      if (window.ResizeObserver && mapContainerRef.current) {
        ro = new ResizeObserver(() => {
          try { map.resize(); } catch {}
        });
        ro.observe(mapContainerRef.current);
      }

      return () => {
        if (ro) ro.disconnect();
        if (mapRef.current) {
          try { mapRef.current.remove(); } catch {}
          mapRef.current = null;
          originMarkerRef.current = null;
          destMarkerRef.current = null;
        }
      };
    } catch (e) {
      console.error("Map initialization error:", e);
    }
  }, []);

  // Sync Markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const setMarker = (ref, loc, type) => {
      if (!loc || !loc.coords) {
        if (ref.current) {
          try { ref.current.remove(); } catch {}
          ref.current = null;
        }
        return;
      }
      if (!ref.current) {
        try {
          ref.current = new maplibregl.Marker({ element: createMarker(type, loc.name), anchor: "center" })
            .setLngLat(loc.coords)
            .addTo(mapRef.current);
        } catch {}
      } else {
        try {
          ref.current.setLngLat(loc.coords);
          const markerEl = ref.current.getElement();
          const textSpan = markerEl.querySelector("span:last-child");
          if (textSpan) textSpan.textContent = loc.name || (type === "origin" ? (isSiteMode ? "Search Region" : "Origin") : "Destination");
          const dotSpan = markerEl.querySelector("span:first-child");
          if (dotSpan) {
            dotSpan.style.background = type === "origin" ? "#10b981" : "#ef4444";
            dotSpan.style.boxShadow = type === "origin" ? "0 0 6px rgba(16,185,129,0.8)" : "0 0 6px rgba(239,68,68,0.8)";
          }
        } catch {}
      }
    };
    setMarker(originMarkerRef, origin, "origin");
    setMarker(destMarkerRef, isSiteMode ? null : destination, "destination");
  }, [origin, destination, mapLoaded, isSiteMode]);

  // Sync Pre-analysis Baseline / Search Circle
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    if (!map.getSource("baseline-src")) return;

    const hasComputedData = Boolean(routesGeoJSON?.features && routesGeoJSON.features.length > 0);

    if (!hasComputedData) {
      if (isSiteMode && origin?.coords) {
        // Render search AOI buffer circle around target location
        try {
          const searchCircle = turf.circle(origin.coords, 18, { units: "kilometers" });
          map.getSource("baseline-src").setData(searchCircle);
          map.easeTo({ center: origin.coords, zoom: 10, duration: 400 });
        } catch {}
      } else if (!isSiteMode && origin?.coords && destination?.coords) {
        // Clear any baseline line so no dummy straight line is shown
        map.getSource("baseline-src").setData({ type: "FeatureCollection", features: [] });
        try {
          const minLng = Math.min(origin.coords[0], destination.coords[0]);
          const maxLng = Math.max(origin.coords[0], destination.coords[0]);
          const minLat = Math.min(origin.coords[1], destination.coords[1]);
          const maxLat = Math.max(origin.coords[1], destination.coords[1]);
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 110, maxZoom: 11, duration: 600 });
        } catch {}
      }
    } else {
      map.getSource("baseline-src").setData({ type: "FeatureCollection", features: [] });
    }
  }, [origin, destination, routesGeoJSON, mapLoaded, isSiteMode]);

  // Sync Computed Features (Routes or Site Polygons) & Centroid Badges
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const hasComputedData = Boolean(routesGeoJSON?.features && routesGeoJSON.features.length > 0);

    try {
      if (hasComputedData) {
        // Sort so the selected item is at the end of the array (rendered on the top)
        const sortedFeatures = [...routesGeoJSON.features].sort((a, b) => {
          if (a.properties?.id === selectedRouteId) return 1;
          if (b.properties?.id === selectedRouteId) return -1;
          return 0;
        });

        const fc = {
          type: "FeatureCollection",
          features: sortedFeatures,
        };

        if (map.getSource("routes-src")) {
          map.getSource("routes-src").setData(fc);
        }

        // Update Site Polygon highlights
        if (map.getLayer("sites-fill")) {
          map.setPaintProperty("sites-fill", "fill-opacity", [
            "case",
            ["==", ["get", "id"], selectedRouteId || "SITE-1"],
            0.6,
            0.25
          ]);
        }
        if (map.getLayer("sites-outline")) {
          map.setPaintProperty("sites-outline", "line-width", [
            "case",
            ["==", ["get", "id"], selectedRouteId || "SITE-1"],
            4.0,
            2.0
          ]);
        }

        // Update Corridor Line highlights
        if (map.getLayer("routes-lines")) {
          map.setPaintProperty("routes-lines", "line-width", [
            "case",
            ["==", ["get", "id"], selectedRouteId || "R-1"],
            7,
            3.5
          ]);
        }
        if (map.getLayer("routes-casing")) {
          map.setPaintProperty("routes-casing", "line-width", [
            "case",
            ["==", ["get", "id"], selectedRouteId || "R-1"],
            10.5,
            5
          ]);
          map.setPaintProperty("routes-casing", "line-color", [
            "case",
            ["==", ["get", "id"], selectedRouteId || "R-1"],
            "#0f172a",
            "#475569"
          ]);
        }

        // In Site Mode, render Centroid Badges on each candidate parcel
        if (isSiteMode) {
          siteMarkersRef.current.forEach((m) => {
            try { m.remove(); } catch {}
          });
          siteMarkersRef.current = [];

          routesGeoJSON.features.forEach((feat) => {
            try {
              const centroid = turf.centroid(feat);
              const coords = centroid.geometry.coordinates;
              const id = feat.properties?.id || feat.id;
              const rank = feat.properties?.rank || 1;
              const areaHa = feat.properties?.metrics?.site_area_ha;
              const areaStr = areaHa != null ? `${Math.round(areaHa)} ha` : "";
              const isSelected = id === selectedRouteId;
              const color = ROUTE_COLORS[id] || "#2563eb";

              const badgeEl = document.createElement("div");
              badgeEl.style.display = "flex";
              badgeEl.style.alignItems = "center";
              badgeEl.style.gap = "6px";
              badgeEl.style.background = isSelected ? "#0f172a" : "rgba(255, 255, 255, 0.98)";
              badgeEl.style.color = isSelected ? "#ffffff" : "#0f172a";
              badgeEl.style.padding = isSelected ? "4px 9px" : "3px 7px";
              badgeEl.style.borderRadius = "6px";
              badgeEl.style.boxShadow = isSelected ? "0 4px 14px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.16)";
              badgeEl.style.border = `2px solid ${color}`;
              badgeEl.style.fontSize = "11px";
              badgeEl.style.fontWeight = "700";
              badgeEl.style.cursor = "pointer";
              badgeEl.style.whiteSpace = "nowrap";
              badgeEl.style.transition = "all 0.15s ease";

              const dot = document.createElement("span");
              dot.style.width = "8px";
              dot.style.height = "8px";
              dot.style.borderRadius = "50%";
              dot.style.background = color;

              const label = document.createElement("span");
              label.textContent = `${rank === 1 ? '🏆 ' : ''}${id}${areaStr ? ` · ${areaStr}` : ''}`;

              badgeEl.appendChild(dot);
              badgeEl.appendChild(label);

              badgeEl.onclick = (e) => {
                e.stopPropagation();
                if (onSelectRouteRef.current) onSelectRouteRef.current(id);
              };

              const marker = new maplibregl.Marker({ element: badgeEl, anchor: "center" })
                .setLngLat(coords)
                .addTo(map);

              siteMarkersRef.current.push(marker);
            } catch {}
          });
        }

        // Auto-fit bounds on first load of results
        if (lastFittedRoutesRef.current !== routesGeoJSON) {
          lastFittedRoutesRef.current = routesGeoJSON;
          lastSelectedSiteRef.current = selectedRouteId;
          try {
            const bbox = turf.bbox(fc);
            map.fitBounds(bbox, { padding: 80, maxZoom: 14, duration: 800 });
          } catch {}
        } else if (isSiteMode && selectedRouteId && lastSelectedSiteRef.current !== selectedRouteId) {
          // When user selects another candidate parcel, smooth-pan to that parcel
          lastSelectedSiteRef.current = selectedRouteId;
          const targetFeat = routesGeoJSON.features.find(f => (f.properties?.id || f.id) === selectedRouteId);
          if (targetFeat) {
            try {
              const bbox = turf.bbox(targetFeat);
              map.fitBounds(bbox, { padding: 110, maxZoom: 15, duration: 600 });
            } catch {}
          }
        }
      } else {
        lastFittedRoutesRef.current = null;
        lastSelectedSiteRef.current = null;
        siteMarkersRef.current.forEach((m) => {
          try { m.remove(); } catch {}
        });
        siteMarkersRef.current = [];

        if (map.getSource("routes-src")) {
          map.getSource("routes-src").setData({ type: "FeatureCollection", features: [] });
        }
        if (map.getSource("buffer-src")) {
          map.getSource("buffer-src").setData({ type: "FeatureCollection", features: [] });
        }
      }
    } catch (e) {
      console.warn("Error updating computed route layers:", e);
    }
  }, [routesGeoJSON, selectedRouteId, mapLoaded, bufferMeters, isSiteMode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

      {mapError && (
        <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', background: 'rgba(239, 68, 68, 0.95)', color: '#fff', padding: '12px 16px', zIndex: 9999, borderRadius: '6px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
          <h3 style={{ marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Map loading error</h3>
          <p>{mapError}</p>
        </div>
      )}

      <div className="mapRightFloatingControls">
        <button className="mapToolSquareBtn" onClick={() => mapRef.current?.zoomIn()} title="Zoom In"><Plus size={16} /></button>
        <button className="mapToolSquareBtn" onClick={() => mapRef.current?.zoomOut()} title="Zoom Out"><Minus size={16} /></button>
      </div>
    </div>
  );
}