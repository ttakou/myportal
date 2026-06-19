"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ComponentType } from "react";
import { useStatusTransition } from "@/components/activity";
import {
  BellRing,
  Flame,
  HandHelping,
  HeartPulse,
  MapPin,
  Megaphone,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  INCIDENT_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  type Accountability,
  type Broadcast,
  type Checkin,
  type DeliveryLog,
  type Incident,
  type IncidentStatus,
  type IncidentType,
  type IncidentUpdate,
  type Severity,
} from "@/types/emergency";
import { sendBroadcast, setBroadcastActive, setIncidentStatus } from "../../actions";
import type { MapHelp, MapIncident } from "./live-map";

// Leaflet touches `window`, so the map is client-only (no SSR).
const LiveMap = dynamic(() => import("./live-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

const TYPE_ICON: Record<IncidentType, ComponentType<{ className?: string }>> = {
  medical: HeartPulse,
  fire: Flame,
  facility: TriangleAlert,
  active_threat: ShieldAlert,
  other: Siren,
};

const SEVERITY_BADGE: Record<Severity, string> = {
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_BADGE: Record<IncidentStatus, string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-amber-100 text-amber-700",
  responding: "bg-sky-100 text-sky-700",
  resolved: "bg-green-100 text-green-700",
};

const CHANNELS = [
  { id: "push", label: "Push" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "Email" },
];

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

export function CommandCenter({
  incidents,
  broadcasts,
  accountability,
  helpRequests,
  deliveries,
  eventTitle,
  updatesByIncident,
}: {
  incidents: Incident[];
  broadcasts: Broadcast[];
  accountability: Accountability;
  helpRequests: Checkin[];
  deliveries: DeliveryLog[];
  eventTitle: string | null;
  updatesByIncident: Record<string, IncidentUpdate[]>;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <IncidentStream
          incidents={incidents}
          updatesByIncident={updatesByIncident}
          pending={pending}
          run={run}
        />
        <GeoMap incidents={incidents} helpRequests={helpRequests} />
        <AccountabilityWidget data={accountability} eventTitle={eventTitle} />
      </div>

      <BroadcastComposer pending={pending} run={run} />

      <ActiveAlerts broadcasts={broadcasts} pending={pending} run={run} />

      <DeliveryAudit deliveries={deliveries} />
    </div>
  );
}

// --- Notification delivery audit --------------------------------------------
function DeliveryAudit({ deliveries }: { deliveries: DeliveryLog[] }) {
  if (deliveries.length === 0) return null;
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <BellRing className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Notification delivery</h2>
      </header>
      <ul className="divide-y">
        {deliveries.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                {d.source_type === "incident" ? "SOS / incident" : "Broadcast"}
              </span>
              <span className="text-muted-foreground">
                {d.audience === "all" ? "All employees" : "Response team"} ·{" "}
                {new Date(d.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
            <span className="flex items-center gap-3 text-xs">
              <span className="text-green-700">{d.delivered} delivered</span>
              {d.failed > 0 && <span className="text-red-700">{d.failed} failed</span>}
              <span className="text-muted-foreground">of {d.recipients} targeted</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Left: live incident stream ---------------------------------------------
function IncidentStream({
  incidents,
  updatesByIncident,
  pending,
  run,
}: {
  incidents: Incident[];
  updatesByIncident: Record<string, IncidentUpdate[]>;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const open = incidents.filter((i) => i.status !== "resolved");
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Live incident stream</h2>
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          {open.length} active
        </span>
      </header>
      <div className="max-h-[28rem] space-y-2 overflow-y-auto p-3">
        {incidents.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">No incidents reported.</p>
        )}
        {incidents.map((i) => {
          const Icon = TYPE_ICON[i.incident_type];
          return (
            <div key={i.id} className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{INCIDENT_LABEL[i.incident_type]}</span>
                    {i.is_sos && (
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">SOS</span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", SEVERITY_BADGE[i.severity])}>
                      {SEVERITY_LABEL[i.severity]}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[i.status])}>
                      {STATUS_LABEL[i.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i.reporter_name ?? "Unknown"}
                    {i.reporter_department ? ` · ${i.reporter_department}` : ""} ·{" "}
                    {new Date(i.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {i.note && <p className="mt-1 text-sm">{i.note}</p>}
                  {(i.location_text || i.lat != null) && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {i.location_text ?? `${i.lat?.toFixed(4)}, ${i.lng?.toFixed(4)}`}
                    </p>
                  )}
                  <IncidentFollowups updates={updatesByIncident[i.id] ?? []} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.status === "open" && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setIncidentStatus(i.id, "acknowledged"))}>
                        Acknowledge
                      </Button>
                    )}
                    {i.status !== "responding" && i.status !== "resolved" && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setIncidentStatus(i.id, "responding"))}>
                        Responding
                      </Button>
                    )}
                    {i.status !== "resolved" && (
                      <Button size="sm" disabled={pending} onClick={() => run(() => setIncidentStatus(i.id, "resolved"))}>
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Follow-up timeline for one incident — reporter updates, location refreshes and
// status changes after it was first raised (the original report is the card
// header, so the 'created' entry is omitted here).
function IncidentFollowups({ updates }: { updates: IncidentUpdate[] }) {
  const followups = updates.filter((u) => u.kind !== "created");
  if (followups.length === 0) return null;
  return (
    <ol className="mt-2 space-y-1 border-l pl-3">
      {followups.map((u) => (
        <li key={u.id} className="text-xs">
          <span className="font-medium">
            {u.kind === "status"
              ? u.status
                ? STATUS_LABEL[u.status]
                : "Status updated"
              : u.kind === "location"
                ? "Location updated"
                : "Reporter update"}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · {new Date(u.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {u.author_name ? ` · ${u.author_name}` : ""}
          </span>
          {u.body && <p className="text-muted-foreground">{u.body}</p>}
          {u.lat != null && u.lng != null && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {u.lat.toFixed(4)}, {u.lng.toFixed(4)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

// --- Center: live (Leaflet) assistance map, default view Douala -------------

// Reference Cameroon cities, reused as the seed for the geocoding gazetteer.
const CMR_CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "Yaoundé", lat: 3.87, lng: 11.52 },
  { name: "Douala", lat: 4.05, lng: 9.77 },
  { name: "Bafoussam", lat: 5.48, lng: 10.42 },
  { name: "Bamenda", lat: 5.96, lng: 10.15 },
  { name: "Buea", lat: 4.15, lng: 9.24 },
  { name: "Kribi", lat: 2.94, lng: 9.91 },
  { name: "Bertoua", lat: 4.58, lng: 13.68 },
  { name: "Ngaoundéré", lat: 7.33, lng: 13.58 },
  { name: "Garoua", lat: 9.3, lng: 13.4 },
  { name: "Maroua", lat: 10.59, lng: 14.32 },
];

// Broader gazetteer for resolving *typed* location descriptions to a coordinate
// (e.g. an SOS where GPS was blocked but the reporter typed "Douala"). Includes
// the reference cities plus other Cameroon towns. Kept local + offline (no
// external geocoding service).
const CMR_GAZETTEER: { name: string; lat: number; lng: number }[] = [
  ...CMR_CITIES,
  { name: "Limbe", lat: 4.02, lng: 9.21 },
  { name: "Edéa", lat: 3.8, lng: 10.13 },
  { name: "Kumba", lat: 4.64, lng: 9.45 },
  { name: "Nkongsamba", lat: 4.95, lng: 9.93 },
  { name: "Ebolowa", lat: 2.9, lng: 11.15 },
  { name: "Sangmélima", lat: 2.93, lng: 11.98 },
  { name: "Dschang", lat: 5.45, lng: 10.05 },
  { name: "Foumban", lat: 5.73, lng: 10.9 },
  { name: "Kousséri", lat: 12.08, lng: 15.03 },
  { name: "Tiko", lat: 4.08, lng: 9.36 },
  { name: "Mbalmayo", lat: 3.52, lng: 11.5 },
  { name: "Bafia", lat: 4.75, lng: 11.23 },
  { name: "Kumbo", lat: 6.2, lng: 10.67 },
  { name: "Wum", lat: 6.38, lng: 10.07 },
];

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Longest names first so a town wins over an accidental shorter substring.
const GAZETTEER_BY_LEN = [...CMR_GAZETTEER].sort(
  (a, b) => b.name.length - a.name.length,
);

/** Best-effort resolution of a free-text location to a known place's coords. */
function geocodeText(
  text: string | null,
): { lat: number; lng: number; name: string } | null {
  if (!text) return null;
  const t = stripAccents(text);
  for (const c of GAZETTEER_BY_LEN) {
    if (t.includes(stripAccents(c.name))) {
      return { lat: c.lat, lng: c.lng, name: c.name };
    }
  }
  return null;
}

function GeoMap({
  incidents,
  helpRequests,
}: {
  incidents: Incident[];
  helpRequests: Checkin[];
}) {
  const helpMarkers = useMemo<MapHelp[]>(
    () => helpRequests.filter((h): h is MapHelp => h.lat != null && h.lng != null),
    [helpRequests],
  );
  // Resolve each active incident to a coordinate: a real GPS fix when present,
  // otherwise a best-effort geocode of the typed location ("Douala"). Incidents
  // whose description can't be placed are surfaced in a separate list so a
  // keyed-in location is never silently dropped from the command center.
  const { incidentMarkers, describedOnly } = useMemo(() => {
    const markers: MapIncident[] = [];
    const described: Incident[] = [];
    for (const i of incidents) {
      if (i.status === "resolved") continue;
      if (i.lat != null && i.lng != null) {
        markers.push({ ...i, resolvedLat: i.lat, resolvedLng: i.lng, approx: false, place: null });
        continue;
      }
      const g = geocodeText(i.location_text);
      if (g) {
        markers.push({ ...i, resolvedLat: g.lat, resolvedLng: g.lng, approx: true, place: g.name });
      } else if (i.location_text) {
        described.push(i);
      }
    }
    return { incidentMarkers: markers, describedOnly: described };
  }, [incidents]);
  const located = helpMarkers.length + incidentMarkers.length;

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Assistance map</h2>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          {located} located
        </span>
      </header>
      <div className="p-3">
        <div className="relative h-[420px] w-full overflow-hidden rounded-lg border">
          <LiveMap incidents={incidentMarkers} helpRequests={helpMarkers} />
          {located === 0 && (
            <p className="pointer-events-none absolute inset-x-0 bottom-1 z-[500] text-center text-[11px] text-muted-foreground">
              No located alerts yet — showing Douala.
            </p>
          )}
        </div>

        <ul className="mt-3 space-y-1.5">
          {helpRequests.map((h) => (
            <li key={h.id} className="rounded-md bg-red-50 px-3 py-2 text-sm">
              <span className="font-medium text-red-800">{h.person_name ?? "Unknown"}</span>
              {h.department && <span className="text-red-700"> · {h.department}</span>}
              {h.note && <p className="text-xs text-red-700">{h.note}</p>}
              {h.lat != null && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600">
                  <MapPin className="h-3 w-3" />
                  {h.lat.toFixed(4)}, {h.lng?.toFixed(4)}
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Keyed-in locations we couldn't place on the map (unknown place name) */}
        {describedOnly.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Described locations (not on map)
            </p>
            <ul className="space-y-1.5">
              {describedOnly.map((i) => (
                <li key={i.id} className="rounded-md bg-amber-50 px-3 py-2 text-sm">
                  <span className="font-medium text-amber-900">
                    {INCIDENT_LABEL[i.incident_type]}
                  </span>
                  {i.reporter_name && (
                    <span className="text-amber-800"> · {i.reporter_name}</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <MapPin className="ml-1 h-3 w-3" />
                    {i.location_text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// --- Right: accountability doughnut -----------------------------------------
function AccountabilityWidget({
  data,
  eventTitle,
}: {
  data: Accountability;
  eventTitle: string | null;
}) {
  const safePct = pct(data.safe, data.total);
  const helpPct = pct(data.needHelp, data.total);
  const unaccPct = Math.max(0, 100 - safePct - helpPct);
  const safeEnd = data.total ? (data.safe / data.total) * 100 : 0;
  const helpEnd = data.total ? ((data.safe + data.needHelp) / data.total) * 100 : 0;

  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="font-semibold">Accountability</h2>
        <p className="text-xs text-muted-foreground">
          {eventTitle ? eventTitle : "Standalone check-ins"}
        </p>
      </header>
      <div className="flex flex-col items-center gap-4 p-4">
        <div
          className="relative h-40 w-40 rounded-full"
          style={{
            background: `conic-gradient(#16a34a 0 ${safeEnd}%, #dc2626 ${safeEnd}% ${helpEnd}%, #d1d5db ${helpEnd}% 100%)`,
          }}
          role="img"
          aria-label={`Safe ${safePct}%, assistance ${helpPct}%, unaccounted ${unaccPct}%`}
        >
          <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-card">
            <span className="text-2xl font-bold">{safePct}%</span>
            <span className="text-xs text-muted-foreground">safe</span>
          </div>
        </div>
        <dl className="grid w-full grid-cols-3 gap-2 text-center">
          <Stat color="bg-green-600" label="Safe" value={data.safe} pct={safePct} />
          <Stat color="bg-red-600" label="Assistance" value={data.needHelp} pct={helpPct} />
          <Stat color="bg-gray-300" label="Unaccounted" value={data.unaccounted} pct={unaccPct} />
        </dl>
        <p className="text-xs text-muted-foreground">{data.total} people in scope</p>
      </div>
    </section>
  );
}

function Stat({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <div className="rounded-lg border p-2">
      <span className={cn("mx-auto mb-1 block h-2 w-2 rounded-full", color)} />
      <dd className="text-lg font-semibold leading-none">{value}</dd>
      <dt className="text-[11px] text-muted-foreground">{label} · {pct}%</dt>
    </div>
  );
}

// --- Broadcast composer ------------------------------------------------------
function BroadcastComposer({
  pending,
  run,
}: {
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Severity>("warning");
  const [channels, setChannels] = useState<string[]>(["push"]);
  const [locationLabel, setLocationLabel] = useState("");
  const [radius, setRadius] = useState("");
  const [requiresCheckin, setRequiresCheckin] = useState(true);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

  function toggleChannel(id: string) {
    setChannels((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setCenter(null),
    );
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Send mass / geofenced alert</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const res = await sendBroadcast({
              title,
              message,
              severity,
              channels,
              locationLabel,
              centerLat: center?.lat ?? null,
              centerLng: center?.lng ?? null,
              radiusM: radius ? Number(radius) : null,
              requiresCheckin,
            });
            if (res.ok) {
              setTitle(""); setMessage(""); setLocationLabel(""); setRadius("");
              setChannels(["push"]); setSeverity("warning"); setRequiresCheckin(true); setCenter(null);
            }
            return res;
          });
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="text-sm">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="e.g. Evacuate Block C" />
        </label>
        <label className="text-sm">
          Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm">
            <option value="info">Informational</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={2}
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Clear instruction for recipients…" />
        </label>
        <label className="text-sm">
          Target area (label)
          <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)}
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="e.g. Lagos fulfillment center" />
        </label>
        <label className="text-sm">
          Geofence radius (metres)
          <input value={radius} onChange={(e) => setRadius(e.target.value)} type="number" min="0"
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="e.g. 500" />
        </label>
        <div className="text-sm">
          <span className="block">Channels</span>
          <div className="mt-1 flex gap-3">
            {CHANNELS.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={channels.includes(c.id)} onChange={() => toggleChannel(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={requiresCheckin} onChange={(e) => setRequiresCheckin(e.target.checked)} />
            Request safety check-in
          </label>
          <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <MapPin className="h-3.5 w-3.5" />
            {center ? `Center set (${center.lat.toFixed(3)}, ${center.lng.toFixed(3)})` : "Use my location as center"}
          </button>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Sending…" : "Broadcast alert"}
          </Button>
        </div>
      </form>
    </section>
  );
}

// --- Active alerts list ------------------------------------------------------
function ActiveAlerts({
  broadcasts,
  pending,
  run,
}: {
  broadcasts: Broadcast[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  if (broadcasts.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Active alerts</h2>
      {broadcasts.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{b.title}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", SEVERITY_BADGE[b.severity])}>
                {SEVERITY_LABEL[b.severity]}
              </span>
              {b.requires_checkin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  <HandHelping className="h-3 w-3" /> check-in
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{b.message}</p>
            <p className="text-xs text-muted-foreground">
              {b.channels.join(", ")}
              {b.location_label ? ` · ${b.location_label}` : ""}
              {b.radius_m ? ` · ${b.radius_m}m` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setBroadcastActive(b.id, false))}>
            End alert
          </Button>
        </div>
      ))}
    </section>
  );
}
