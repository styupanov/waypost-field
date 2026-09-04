"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteFeature } from "@/types/route";
import type {
  Coordinates,
  DraftAttractionStop,
  DraftOvernightStop,
  PickingMode,
  TripField,
} from "@/types/trip";
import type { TripAlternative } from "@/types/trip";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type MapCanvasProps = {
  route: RouteFeature | null;
  attractionStops: DraftAttractionStop[];
  alternatives: TripAlternative[];
  overnightStops: DraftOvernightStop[];
  originCoordinates: Coordinates | null;
  stopCoordinates: Coordinates | null;
  destinationCoordinates: Coordinates | null;
  pickingMode: PickingMode;
  activePoiId: number | null;
  hoveredPoiId: number | null;
  isReplacing: boolean;
  onMapPointSelected: (field: TripField, coordinates: Coordinates) => void;
  onPoiHover: (attractionId: number | null) => void;
  onPoiSelect: (attractionId: number) => void;
};

const ROUTE_SOURCE_ID = "route";
const ROUTE_LAYER_ID = "route-line";

function renderRoute(map: maplibregl.Map, route: RouteFeature) {
  const routeSource = map.getSource(ROUTE_SOURCE_ID);

  if (routeSource) {
    (routeSource as maplibregl.GeoJSONSource).setData(route);
  } else {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: route,
    });
  }

  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#1f2937",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });
  }

  const bounds = new maplibregl.LngLatBounds();

  for (const coordinate of route.geometry.coordinates) {
    bounds.extend(coordinate);
  }

  map.fitBounds(bounds, {
    padding: 80,
    duration: 1200,
  });
}

function updateMarker(
  map: maplibregl.Map,
  markerRef: React.MutableRefObject<maplibregl.Marker | null>,
  coordinates: Coordinates | null,
  color: string
) {
  if (!coordinates) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }

  const lngLat: [number, number] = [coordinates.lon, coordinates.lat];

  if (markerRef.current) {
    markerRef.current.setLngLat(lngLat);
  } else {
    markerRef.current = new maplibregl.Marker({ color })
      .setLngLat(lngLat)
      .addTo(map);
  }
}

function updateEndpointMarker(
  map: maplibregl.Map,
  markerRef: React.MutableRefObject<maplibregl.Marker | null>,
  coordinates: Coordinates | null,
  label: "A" | "B",
  color: string
) {
  if (!coordinates) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }
  const lngLat: [number, number] = [coordinates.lon, coordinates.lat];
  if (markerRef.current) {
    markerRef.current.setLngLat(lngLat);
    return;
  }
  const element = document.createElement("div");
  element.textContent = label;
  element.setAttribute("aria-label", label === "A" ? "Trip origin" : "Trip destination");
  Object.assign(element.style, {
    width: "28px",
    height: "28px",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    border: "2px solid white",
    background: color,
    color: "white",
    font: "700 13px sans-serif",
    boxShadow: "0 2px 7px rgb(15 23 42 / 35%)",
  });
  markerRef.current = new maplibregl.Marker({ element })
    .setLngLat(lngLat)
    .addTo(map);
}

function setPoiMarkerPresentation(
  marker: maplibregl.Marker,
  emphasized: boolean,
  selectable: boolean
) {
  const element = marker.getElement();
  element.style.filter = emphasized
    ? "drop-shadow(0 0 5px rgb(15 23 42 / 70%)) brightness(1.12)"
    : "";
  element.style.opacity = selectable || emphasized ? "1" : "0.82";
  element.style.zIndex = emphasized ? "3" : "1";
}

export default function MapCanvas({
  route,
  attractionStops,
  alternatives,
  overnightStops,
  originCoordinates,
  stopCoordinates,
  destinationCoordinates,
  pickingMode,
  activePoiId,
  hoveredPoiId,
  isReplacing,
  onMapPointSelected,
  onPoiHover,
  onPoiSelect,
}: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const originMarker = useRef<maplibregl.Marker | null>(null);
  const stopMarker = useRef<maplibregl.Marker | null>(null);
  const destinationMarker = useRef<maplibregl.Marker | null>(null);
  const waypostMarkers = useRef(new Map<number, maplibregl.Marker>());
  const alternativeMarkers = useRef(new Map<number, maplibregl.Marker>());
  const overnightMarkers = useRef(new Map<number, maplibregl.Marker>());
  const onPoiHoverRef = useRef(onPoiHover);
  const onPoiSelectRef = useRef(onPoiSelect);

  useEffect(() => {
    onPoiHoverRef.current = onPoiHover;
    onPoiSelectRef.current = onPoiSelect;
  }, [onPoiHover, onPoiSelect]);

  useEffect(() => {
    if (!mapContainer.current || map.current) {
      return;
    }

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-98.5, 39.5],
      zoom: 3.5,
    });

    map.current = mapInstance;
    const managedWaypostMarkers = waypostMarkers.current;
    const managedAlternativeMarkers = alternativeMarkers.current;
    const managedOvernightMarkers = overnightMarkers.current;

    mapInstance.on("error", (event) => {
      console.error("MapLibre error:", event.error);
    });

    mapInstance.addControl(
      new maplibregl.NavigationControl(),
      "bottom-right"
    );

    return () => {
      originMarker.current?.remove();
      stopMarker.current?.remove();
      destinationMarker.current?.remove();
      for (const marker of managedWaypostMarkers.values()) marker.remove();
      managedWaypostMarkers.clear();
      for (const marker of managedAlternativeMarkers.values()) marker.remove();
      managedAlternativeMarkers.clear();
      for (const marker of managedOvernightMarkers.values()) marker.remove();
      managedOvernightMarkers.clear();
      originMarker.current = null;
      stopMarker.current = null;
      destinationMarker.current = null;
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const mapInstance = map.current;

    if (!mapInstance || !route) {
      return;
    }

    if (mapInstance.isStyleLoaded()) {
      renderRoute(mapInstance, route);
      return;
    }

    const handleLoad = () => renderRoute(mapInstance, route);
    mapInstance.once("load", handleLoad);

    return () => {
      mapInstance.off("load", handleLoad);
    };
  }, [route]);

  useEffect(() => {
    const mapInstance = map.current;

    if (!mapInstance) {
      return;
    }

    updateEndpointMarker(
      mapInstance,
      originMarker,
      originCoordinates,
      "A",
      "#15803d"
    );
  }, [originCoordinates]);

  useEffect(() => {
    const mapInstance = map.current;

    if (!mapInstance) {
      return;
    }

    updateMarker(mapInstance, stopMarker, stopCoordinates, "#d97706");
  }, [stopCoordinates]);

  useEffect(() => {
    const mapInstance = map.current;

    if (!mapInstance) {
      return;
    }

    updateEndpointMarker(
      mapInstance,
      destinationMarker,
      destinationCoordinates,
      "B",
      "#b42318"
    );
  }, [destinationCoordinates]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    const activeIds = new Set(attractionStops.map((stop) => stop.attractionId));
    for (const [id, marker] of waypostMarkers.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        waypostMarkers.current.delete(id);
      }
    }
    for (const stop of attractionStops) {
      const position: [number, number] = [
        stop.coordinates.lon,
        stop.coordinates.lat,
      ];
      const existing = waypostMarkers.current.get(stop.attractionId);
      if (existing) {
        existing.setLngLat(position);
      } else {
        const popup = new maplibregl.Popup({ offset: 20 }).setText(stop.label);
        popup.on("open", () => onPoiSelectRef.current(stop.attractionId));
        const marker = new maplibregl.Marker({
            color: stop.source === "waypost" ? "#7c3aed" : "#d97706",
            scale: stop.source === "waypost" ? 0.8 : 0.9,
          })
            .setLngLat(position)
            .setPopup(popup)
            .addTo(mapInstance);
        marker.getElement().setAttribute(
          "aria-label",
          `${stop.label} — ${stop.source === "waypost" ? "Waypost suggestion" : "Added by you"}`
        );
        marker.getElement().addEventListener("mouseenter", () =>
          onPoiHoverRef.current(stop.attractionId)
        );
        marker.getElement().addEventListener("mouseleave", () =>
          onPoiHoverRef.current(null)
        );
        waypostMarkers.current.set(stop.attractionId, marker);
      }
    }
  }, [attractionStops]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    const activeIds = new Set(alternatives.map((item) => item.attractionId));
    for (const [id, marker] of alternativeMarkers.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        alternativeMarkers.current.delete(id);
      }
    }
    for (const alternative of alternatives) {
      const position: [number, number] = [
        alternative.coordinates.lon,
        alternative.coordinates.lat,
      ];
      const existing = alternativeMarkers.current.get(alternative.attractionId);
      if (existing) {
        existing.setLngLat(position);
      } else {
        const popup = new maplibregl.Popup({ offset: 14 }).setText(
          `${alternative.name} · Along the way`
        );
        popup.on("open", () =>
          onPoiSelectRef.current(alternative.attractionId)
        );
        const marker = new maplibregl.Marker({ color: "#64748b", scale: 0.55 })
            .setLngLat(position)
            .setPopup(popup)
            .addTo(mapInstance);
        marker.getElement().setAttribute(
          "aria-label",
          `${alternative.name} — Along the way`
        );
        marker.getElement().addEventListener("mouseenter", () =>
          onPoiHoverRef.current(alternative.attractionId)
        );
        marker.getElement().addEventListener("mouseleave", () =>
          onPoiHoverRef.current(null)
        );
        alternativeMarkers.current.set(alternative.attractionId, marker);
      }
    }
  }, [alternatives]);

  useEffect(() => {
    const mapInstance = map.current; if (!mapInstance) return;
    const active = new Set(overnightStops.map((stop) => stop.nightIndex));
    for (const [night, marker] of overnightMarkers.current) if (!active.has(night)) { marker.remove(); overnightMarkers.current.delete(night); }
    for (const stop of overnightStops) {
      const position: [number, number] = [stop.coordinates.lon, stop.coordinates.lat];
      const existing = overnightMarkers.current.get(stop.nightIndex);
      if (existing) existing.setLngLat(position);
      else {
        const element = document.createElement("div"); element.textContent = String(stop.nightIndex); element.setAttribute("aria-label", `Night ${stop.nightIndex}: ${stop.label} area`);
        Object.assign(element.style, { width: "25px", height: "25px", display: "grid", placeItems: "center", borderRadius: "6px", border: "2px solid white", background: "#0f766e", color: "white", font: "700 11px sans-serif", boxShadow: "0 2px 7px rgb(15 23 42 / 35%)" });
        const marker = new maplibregl.Marker({ element }).setLngLat(position).setPopup(new maplibregl.Popup({ offset: 18 }).setText(`Night ${stop.nightIndex} · ${stop.label}${stop.admin1Code ? `, ${stop.admin1Code}` : ""} area`)).addTo(mapInstance);
        overnightMarkers.current.set(stop.nightIndex, marker);
      }
    }
  }, [overnightStops]);

  useEffect(() => {
    const emphasizedId = hoveredPoiId ?? activePoiId;
    for (const [id, marker] of waypostMarkers.current) {
      setPoiMarkerPresentation(marker, id === emphasizedId, true);
    }
    for (const [id, marker] of alternativeMarkers.current) {
      setPoiMarkerPresentation(marker, id === emphasizedId, isReplacing);
    }
  }, [activePoiId, hoveredPoiId, isReplacing, attractionStops, alternatives]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || activePoiId === null) return;
    const selected = attractionStops.find(
      (stop) => stop.attractionId === activePoiId
    );
    const alternative = alternatives.find(
      (item) => item.attractionId === activePoiId
    );
    const coordinates = selected?.coordinates ?? alternative?.coordinates;
    if (!coordinates) return;
    mapInstance.easeTo({
      center: [coordinates.lon, coordinates.lat],
      zoom: Math.max(mapInstance.getZoom(), 8),
      duration: 700,
    });
  }, [activePoiId, attractionStops, alternatives]);

  useEffect(() => {
    const mapInstance = map.current;

    if (!mapInstance) {
      return;
    }

    const canvas = mapInstance.getCanvas();
    canvas.style.cursor = pickingMode ? "crosshair" : "";

    if (!pickingMode) {
      return;
    }

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      onMapPointSelected(pickingMode, {
        lat: event.lngLat.lat,
        lon: event.lngLat.lng,
      });
    };

    mapInstance.once("click", handleMapClick);

    return () => {
      mapInstance.off("click", handleMapClick);
      canvas.style.cursor = "";
    };
  }, [onMapPointSelected, pickingMode]);

  return <div ref={mapContainer} className="map-canvas" />;
}
