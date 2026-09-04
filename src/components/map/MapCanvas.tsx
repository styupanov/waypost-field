"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteFeature } from "@/types/route";
import type {
  Coordinates,
  DraftAttractionStop,
  PickingMode,
  TripField,
} from "@/types/trip";
import type { TripAlternative } from "@/types/trip";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type MapCanvasProps = {
  route: RouteFeature | null;
  attractionStops: DraftAttractionStop[];
  alternatives: TripAlternative[];
  originCoordinates: Coordinates | null;
  stopCoordinates: Coordinates | null;
  destinationCoordinates: Coordinates | null;
  pickingMode: PickingMode;
  onMapPointSelected: (field: TripField, coordinates: Coordinates) => void;
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

export default function MapCanvas({
  route,
  attractionStops,
  alternatives,
  originCoordinates,
  stopCoordinates,
  destinationCoordinates,
  pickingMode,
  onMapPointSelected,
}: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const originMarker = useRef<maplibregl.Marker | null>(null);
  const stopMarker = useRef<maplibregl.Marker | null>(null);
  const destinationMarker = useRef<maplibregl.Marker | null>(null);
  const waypostMarkers = useRef(new Map<number, maplibregl.Marker>());
  const alternativeMarkers = useRef(new Map<number, maplibregl.Marker>());

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

    updateMarker(mapInstance, originMarker, originCoordinates, "#15803d");
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

    updateMarker(
      mapInstance,
      destinationMarker,
      destinationCoordinates,
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
        waypostMarkers.current.set(
          stop.attractionId,
          new maplibregl.Marker({ color: "#7c3aed", scale: 0.8 })
            .setLngLat(position)
            .setPopup(new maplibregl.Popup({ offset: 20 }).setText(stop.label))
            .addTo(mapInstance)
        );
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
        alternativeMarkers.current.set(
          alternative.attractionId,
          new maplibregl.Marker({ color: "#64748b", scale: 0.5 })
            .setLngLat(position)
            .setPopup(
              new maplibregl.Popup({ offset: 14 }).setText(
                `${alternative.name} · Along the way`
              )
            )
            .addTo(mapInstance)
        );
      }
    }
  }, [alternatives]);

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
