"use client";

import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { INCIDENT_LABEL, type Checkin, type Incident } from "@/types/emergency";

/** Douala — the default view for the assistance map. */
const DOUALA: [number, number] = [4.0511, 9.7679];
const DEFAULT_ZOOM = 12;

export type MapIncident = Incident & {
  resolvedLat: number;
  resolvedLng: number;
  approx: boolean;
  place: string | null;
};

export type MapHelp = Checkin & { lat: number; lng: number };

export default function LiveMap({
  incidents,
  helpRequests,
}: {
  incidents: MapIncident[];
  helpRequests: MapHelp[];
}) {
  return (
    <MapContainer
      center={DOUALA}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "#e5e7eb" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      {/* People who need assistance — pulsing red dots. */}
      {helpRequests.map((h) => (
        <CircleMarker
          key={`h-${h.id}`}
          center={[h.lat, h.lng]}
          radius={8}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#b91c1c", fillOpacity: 0.95 }}
        >
          <Tooltip>
            <span className="font-medium">{h.person_name ?? "Unknown"}</span>
            {h.department ? ` · ${h.department}` : ""}
            {h.note ? <div>{h.note}</div> : null}
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Active incidents — solid for a real GPS fix, dashed when geocoded from text. */}
      {incidents.map((i) => (
        <CircleMarker
          key={`i-${i.id}`}
          center={[i.resolvedLat, i.resolvedLng]}
          radius={10}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: "#dc2626",
            fillOpacity: 0.9,
            dashArray: i.approx ? "4 3" : undefined,
          }}
        >
          <Tooltip>
            <span className="font-medium">{INCIDENT_LABEL[i.incident_type]}</span>
            {i.reporter_name ? ` — ${i.reporter_name}` : ""}
            {i.approx ? (
              <div className="text-amber-700">approx · {i.place}</div>
            ) : null}
            {i.location_text ? <div>{i.location_text}</div> : null}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
