import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { pillarColors, type MapFeature, type Place } from "./domain";
export function MapView({
  place,
  origin,
  radiusKm,
  features,
  onPick,
}: {
  place: Place;
  origin: { longitude: number; latitude: number };
  radiusKm: number;
  features: MapFeature[];
  onPick: (point: { longitude: number; latitude: number }) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    records = useRef<L.FeatureGroup | null>(null),
    onPickRef = useRef(onPick);
  const [tileError, setTileError] = useState(false);
  onPickRef.current = onPick;
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      preferCanvas: true,
      scrollWheelZoom: false,
    }).setView([origin.latitude, origin.longitude], 12);
    map.current = instance;
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    ).addTo(instance);
    tiles.on("tileerror", () => setTileError(true));
    instance.on("click", (event: L.LeafletMouseEvent) =>
      onPickRef.current({
        longitude: event.latlng.lng,
        latitude: event.latlng.lat,
      }),
    );
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const group = L.featureGroup().addTo(instance);
    L.geoJSON(
      { type: "Feature", geometry: place.geometry, properties: {} } as any,
      {
        style: {
          color: "#35664f",
          weight: 2,
          fillOpacity: 0.035,
          bubblingMouseEvents: false,
        },
      },
    )
      .bindTooltip(`${place.name} · town boundary`)
      .addTo(group);
    const radius = L.circle([origin.latitude, origin.longitude], {
      radius: radiusKm * 1000,
      color: "#658fa8",
      weight: 1,
      dashArray: "6 6",
      fillOpacity: 0.03,
      interactive: false,
    }).addTo(group);
    L.marker([origin.latitude, origin.longitude], {
      icon: L.divIcon({
        className: "search-anchor-icon",
        html: "<span>⌂</span>",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
      keyboard: true,
    })
      .bindTooltip("Your search anchor")
      .addTo(group);
    instance.fitBounds(radius.getBounds(), { padding: [18, 18], maxZoom: 15 });
    return () => {
      group.remove();
    };
  }, [place, origin, radiusKm]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const group = L.featureGroup().addTo(instance);
    records.current = group;
    for (const feature of features) {
      if (!feature.geometry) continue;
      const color = pillarColors[feature.vertical] ?? "#657d8e";
      L.geoJSON(feature as any, {
        style: (f) => ({
          color: f?.geometry.type === "Point" ? "#fff" : color,
          fillColor: color,
          weight: f?.geometry.type === "Point" ? 1.5 : 2,
          fillOpacity: f?.geometry.type === "Point" ? 0.95 : 0.1,
          bubblingMouseEvents: false,
        }),
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, {
            radius: 6,
            color: "#fff",
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.95,
            bubblingMouseEvents: false,
          }),
        onEachFeature: (_f, layer) => {
          const node = document.createElement("div");
          const heading = document.createElement("strong");
          heading.textContent =
            feature.properties.name ?? "Recorded source feature";
          node.append(heading);
          for (const text of [
            feature.properties.category.replace(/_/g, " "),
            `Observed: ${feature.properties.observedPeriod ?? "unknown"}`,
            `Services: ${feature.criteria.map((id) => id.split(".").at(-1)?.replace(/_/g, " ")).join(", ")}`,
          ]) {
            const line = document.createElement("div");
            line.textContent = text;
            node.append(line);
          }
          layer.bindPopup(node);
          const tooltip = document.createElement("span");
          tooltip.textContent = feature.properties.name;
          layer.bindTooltip(tooltip);
        },
      }).addTo(group);
    }
    return () => {
      group.remove();
      records.current = null;
    };
  }, [features]);
  return (
    <div className="map-frame">
      <div
        ref={element}
        className="live-map"
        aria-label={`Interactive map of all visible recorded services around ${place.name}`}
      />
      <button
        className="fit-map"
        disabled={!features.length}
        onClick={() => {
          const bounds = records.current?.getBounds();
          if (bounds?.isValid())
            map.current?.fitBounds(bounds, { padding: [25, 25], maxZoom: 15 });
        }}
      >
        Fit visible records
      </button>
      {tileError && (
        <span className="tile-notice">
          Base tiles unavailable · source layers remain visible
        </span>
      )}
    </div>
  );
}
