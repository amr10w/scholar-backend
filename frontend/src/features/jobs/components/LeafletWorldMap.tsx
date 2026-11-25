"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject } from "geojson";
import worldGeoJSON from "../data/world.geo.json";

export interface LeafletWorldMapProps {
  selectedCountries: string[];
  countryCounts: Record<string, number>;
  itemNoun: "opening" | "company";
  onToggleCountry: (country: string) => void;
}

const COUNTRY_CENTERS: Record<string, [number, number]> = {
  Egypt: [26.8206, 30.8025],
  "Saudi Arabia": [23.8859, 45.0792],
  "United Arab Emirates": [23.4241, 53.8478],
  "United States of America": [39.8283, -98.5795],
  "United Kingdom": [55.3781, -3.436],
  Germany: [51.1657, 10.4515],
  France: [46.2276, 2.2137],
  Spain: [40.4637, -3.7492],
  Italy: [41.8719, 12.5674],
  Turkey: [38.9637, 35.2433],
  Canada: [56.1304, -106.3468],
  Japan: [36.2048, 138.2529],
  India: [20.5937, 78.9629],
  Australia: [-25.2744, 133.7751],
};

function readTokenColors() {
  const styles = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const themeAttr = document.documentElement.getAttribute("data-theme");
  const isDark =
    themeAttr === "dark" ||
    (themeAttr !== "light" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  return {
    isDark,
    selectedFill: get("--color-primary-300", "currentColor"),
    baseFill: get("--color-neutral-800", "currentColor"),
    hoverFill: get("--color-neutral-600", "currentColor"),
    border: get("--color-neutral-500", "currentColor"),
    surface: get("--color-surface", "transparent"),
    ink: get("--color-neutral-50", "currentColor"),
    accent: get("--color-accent-300", "currentColor"),
  };
}

function pluralizeNoun(noun: "opening" | "company", count: number): string {
  if (noun === "company") return count === 1 ? "company" : "companies";
  return count === 1 ? "opening" : "openings";
}

export default function LeafletWorldMap({
  selectedCountries,
  countryCounts,
  itemNoun,
  onToggleCountry,
}: LeafletWorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const selectedRef = useRef(selectedCountries);
  const onToggleRef = useRef(onToggleCountry);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => {
    selectedRef.current = selectedCountries;
  }, [selectedCountries]);

  useEffect(() => {
    onToggleRef.current = onToggleCountry;
  }, [onToggleCountry]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const palette = readTokenColors();
    const map = L.map(container, {
      center: [26, 30],
      zoom: 3,
      minZoom: 2,
      maxZoom: 8,
      maxBounds: [
        [-85, -180],
        [85, 180],
      ],
      maxBoundsViscosity: 1.0,
      attributionControl: true,
    });
    mapRef.current = map;

    const tileLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        className: palette.isDark ? "scholar-map-tiles-dark" : "",
      },
    );
    tileLayer.on("tileerror", () => setTilesFailed(true));
    tileLayer.addTo(map);

    const geoLayer = L.geoJSON(worldGeoJSON as GeoJsonObject, {
      style: (feature) => {
        const name = String(feature?.properties?.name ?? "");
        const isSelected = selectedRef.current.includes(name);
        return {
          fillColor: isSelected ? palette.selectedFill : palette.baseFill,
          weight: 1,
          opacity: 1,
          color: palette.border,
          fillOpacity: isSelected ? 0.72 : 0.78,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = String(feature?.properties?.name ?? "");
        const count = countryCounts[name] ?? 0;
        layer.bindTooltip(
          `${name}: ${count} ${pluralizeNoun(itemNoun, count)}`,
          { direction: "top", sticky: true },
        );
        layer.on({
          mouseover: (event: L.LeafletMouseEvent) => {
            if (!selectedRef.current.includes(name)) {
              (event.target as L.Path).setStyle({
                fillColor: palette.hoverFill,
                fillOpacity: 0.9,
              });
            }
          },
          mouseout: (event: L.LeafletMouseEvent) => {
            if (!selectedRef.current.includes(name)) {
              (event.target as L.Path).setStyle({
                fillColor: palette.baseFill,
                fillOpacity: 0.78,
              });
            }
          },
          click: () => {
            if (name) onToggleRef.current(name);
          },
        });
      },
    }).addTo(map);
    geoLayerRef.current = geoLayer;

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    // Ensure Leaflet recalculates size inside modal transition
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      geoLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, [countryCounts, itemNoun]);

  // Sync polygon highlight & count markers whenever selection or theme changes
  useEffect(() => {
    const palette = readTokenColors();
    const geoLayer = geoLayerRef.current;
    if (geoLayer) {
      geoLayer.eachLayer((layer) => {
        const feature = (layer as L.GeoJSON & { feature?: { properties?: { name?: string } } }).feature;
        const name = String(feature?.properties?.name ?? "");
        const isSelected = selectedCountries.includes(name);
        (layer as L.Path).setStyle({
          fillColor: isSelected ? palette.selectedFill : palette.baseFill,
          fillOpacity: isSelected ? 0.72 : 0.78,
        });
      });
    }

    const markersGroup = markersLayerRef.current;
    if (markersGroup) {
      markersGroup.clearLayers();
      for (const [country, count] of Object.entries(countryCounts)) {
        const coords = COUNTRY_CENTERS[country];
        if (!coords || count <= 0) continue;
        const isSelected = selectedCountries.includes(country);
        const icon = L.divIcon({
          html: `<div class="flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold shadow-lg ${
            isSelected
              ? "border-accent-200 bg-primary-500 text-on-action"
              : "border-primary-300 bg-surface text-neutral-50"
          }" style="transform: translate(-50%, -50%);">${count}</div>`,
          className: "",
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        L.marker(coords, { icon })
          .on("click", () => onToggleRef.current(country))
          .addTo(markersGroup);
      }
    }
  }, [selectedCountries, countryCounts]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-neutral-500/70 bg-neutral-900">
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Interactive world map for selecting countries"
      />
      {tilesFailed && (
        <div
          role="status"
          className="pointer-events-none absolute top-3 left-1/2 z-[400] -translate-x-1/2 rounded-full border border-neutral-500 bg-surface/95 px-3 py-1 text-xs text-neutral-100 shadow"
        >
          Map tiles unavailable — use the country checklist beside the map.
        </div>
      )}
    </div>
  );
}
