"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Anchor,
  BedDouble,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  History,
  LayoutGrid,
  Plane,
  Trash2,
  Users,
  UserCog,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/types/offshore";
import {
  GENDER_LABEL,
  MANIFEST_STATUS_LABEL,
  ROOM_STATUS_LABEL,
  TRIP_TYPE_LABEL,
  VISIT_STATUS_LABEL,
  VISITOR_TYPE_LABEL,
  type AccommodationSummary,
  type AssignableEmployee,
  type CertAlert,
  type Crew,
  type CrewChangeSuggestion,
  type GenderRestriction,
  type Manifest,
  type ManifestStatus,
  type PobBreakdown,
  type Room,
  type RoomAvailability,
  type RoomStatus,
  type RosterEntry,
  type RotationCalendar,
  type RotationDay,
  type VisitRequest,
  type VisitStatus,
} from "@/types/offshore";
import {
  addRosterMember,
  allocateVisitorBed,
  confirmManifestMovement,
  decideVisitRequest,
  deleteCrew,
  findAvailableBeds,
  generateCrewManifest,
  generateNextCrewChange,
  removeManifestPax,
  removeRosterMember,
  setInstallationActive,
  setManifestStatus,
  setRoomStatus,
  setVisitorMovement,
  togglePaxNoShow,
  updateRoomFields,
  updateRosterMember,
  upsertCrew,
  upsertInstallation,
  upsertRoom,
} from "../actions";
import { BulkRoomImport } from "./bulk-room-import";
import { BulkRosterImport } from "./bulk-roster-import";
import { CateringPanel } from "./catering-panel";
import { HistoryPanel } from "./history-panel";
import { CrewAssign } from "./crew-assign";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
type Tab =
  | "dashboard"
  | "installations"
  | "crews"
  | "calendar"
  | "rooms"
  | "roster"
  | "assign"
  | "visitors"
  | "manifests"
  | "catering"
  | "history";

export function OffshoreManagement(props: {
  crews: Crew[];
  rooms: Room[];
  roster: RosterEntry[];
  installations: Installation[];
  manageInstallations: Installation[];
  addable: { id: string; full_name: string }[];
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
  certAlerts: CertAlert[];
  visits: VisitRequest[];
  manifests: Manifest[];
  calendar: RotationCalendar;
  employees: AssignableEmployee[];
  suggestions: CrewChangeSuggestion[];
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const pendingVisits = props.visits.filter((v) => v.status === "requested").length;
  const tabs: { key: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { key: "dashboard", label: "POB & dashboards", icon: LayoutGrid },
    { key: "installations", label: "Installations", icon: Anchor },
    { key: "crews", label: "Crew change", icon: CalendarClock },
    { key: "calendar", label: "Rotation calendar", icon: CalendarRange },
    { key: "manifests", label: "Manifests", icon: ClipboardList },
    { key: "rooms", label: "Accommodation", icon: BedDouble },
    { key: "catering", label: "Catering", icon: UtensilsCrossed },
    { key: "roster", label: "Offshore staff", icon: Users },
    { key: "assign", label: "Assign crews", icon: UserCog },
    { key: "visitors", label: "Visitors", icon: Plane, badge: pendingVisits },
    { key: "history", label: "History", icon: History },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.badge ? (
              <span className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <Dashboard pob={props.pob} accommodation={props.accommodation} certAlerts={props.certAlerts} />
      )}
      {tab === "installations" && <InstallationsPanel installations={props.manageInstallations} />}
      {tab === "crews" && (
        <CrewsPanel crews={props.crews} installations={props.installations} suggestions={props.suggestions} />
      )}
      {tab === "calendar" && <RotationCalendarPanel calendar={props.calendar} />}
      {tab === "rooms" && <RoomsPanel rooms={props.rooms} installations={props.installations} />}
      {tab === "roster" && (
        <RosterPanel
          roster={props.roster}
          crews={props.crews}
          rooms={props.rooms}
          addable={props.addable}
        />
      )}
      {tab === "visitors" && <VisitorsPanel visits={props.visits} />}
      {tab === "manifests" && <ManifestsPanel manifests={props.manifests} crews={props.crews} />}
      {tab === "assign" && <CrewAssign employees={props.employees} crews={props.crews} />}
      {tab === "catering" && <CateringPanel installations={props.installations} />}
      {tab === "history" && <HistoryPanel />}
    </div>
  );
}

const MANIFEST_STYLE: Record<ManifestStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-accent text-accent-foreground",
  locked: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

function ManifestsPanel({ manifests, crews }: { manifests: Manifest[]; crews: Crew[] }) {
  const { pending, error, run } = useRun();
  const [crewId, setCrewId] = useState("");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [date, setDate] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => generateCrewManifest({ crewId, direction, scheduledDate: date }),
            () => setDate(""),
          );
        }}
      >
        <span className="text-sm font-medium">Generate crew manifest:</span>
        <select value={crewId} onChange={(e) => setCrewId(e.target.value)} required className={field}>
          <option value="">Crew…</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in")} className={field}>
          <option value="out">Outbound</option>
          <option value="in">Inbound</option>
        </select>
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required className={field} />
        <Button type="submit" size="sm" disabled={pending || !crewId}>Generate</Button>
      </form>

      <div className="space-y-3">
        {manifests.map((m) => (
          <ManifestCard key={m.id} m={m} pending={pending} run={run} />
        ))}
        {manifests.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No manifests yet.
          </p>
        )}
      </div>
    </div>
  );
}

function ManifestCard({
  m,
  pending,
  run,
}: {
  m: Manifest;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const travelling = m.pax.filter((p) => !p.no_show);
  const overCapacity = travelling.length > m.seat_capacity;
  const issues = travelling.filter((p) => p.issues.length > 0).length;
  const editable = m.status === "draft" || m.status === "approved";

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", MANIFEST_STYLE[m.status])}>
          {MANIFEST_STATUS_LABEL[m.status]}
        </span>
        <span className="font-medium">{m.title}</span>
        <span className="text-xs text-muted-foreground">{TRIP_TYPE_LABEL[m.trip_type] ?? m.trip_type}</span>
        <span className={cn("ml-auto text-xs", overCapacity ? "font-medium text-destructive" : "text-muted-foreground")}>
          {travelling.length}/{m.seat_capacity} seats
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {m.installation_name ?? "—"} · {m.scheduled_date}
        {m.transport_mode ? ` · ${m.transport_mode}` : ""}
        {issues > 0 ? ` · ${issues} eligibility issue(s)` : ""}
      </p>

      <div className="mt-2 space-y-1">
        {m.pax.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-sm",
              p.no_show && "opacity-50",
            )}
          >
            <span className={cn(p.no_show && "line-through")}>{p.person_name}</span>
            {p.position && <span className="text-xs text-muted-foreground">{p.position}</span>}
            {p.boarded && <span className="text-[11px] text-green-700">boarded</span>}
            {p.issues.length > 0 && (
              <span className="rounded bg-destructive/10 px-1.5 text-[11px] text-destructive">
                {p.issues.join(", ")}
              </span>
            )}
            {editable && (
              <span className="ml-auto flex gap-1">
                <button
                  disabled={pending}
                  onClick={() => run(() => togglePaxNoShow(p.id, !p.no_show))}
                  className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                >
                  {p.no_show ? "Travelling" : "No-show"}
                </button>
                <button
                  disabled={pending}
                  onClick={() => run(() => removeManifestPax(p.id))}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        ))}
        {m.pax.length === 0 && <p className="text-xs text-muted-foreground">No passengers.</p>}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {m.status === "draft" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setManifestStatus(m.id, "approved"))}>
            Approve
          </Button>
        )}
        {m.status === "approved" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setManifestStatus(m.id, "locked"))}>
            Lock
          </Button>
        )}
        {m.status === "locked" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => confirmManifestMovement(m.id))}>
            Confirm {m.direction === "out" ? "departure (board)" : "arrival onshore"}
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setManifestStatus(m.id, "cancelled"))}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

const VISIT_STYLE: Record<VisitStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  approved: "bg-accent text-accent-foreground",
  rejected: "bg-destructive/10 text-destructive line-through",
  onboard: "bg-primary/10 text-primary",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

function VisitorsPanel({ visits }: { visits: VisitRequest[] }) {
  const { pending, error, run } = useRun();
  const open = visits.filter((v) => !["returned", "rejected", "cancelled"].includes(v.status));
  const closed = visits.filter((v) => ["returned", "rejected", "cancelled"].includes(v.status));

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">No active visitor requests.</p>
      )}
      <div className="space-y-3">
        {open.map((v) => (
          <VisitorCard key={v.id} v={v} pending={pending} run={run} />
        ))}
      </div>
      {closed.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">History ({closed.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {closed.map((v) => (
              <li key={v.id}>
                {v.visitor_name} · {v.installation_name ?? "—"} · {VISIT_STATUS_LABEL[v.status]}
                {v.depart_date ? ` · ${v.depart_date}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function VisitorCard({
  v,
  pending,
  run,
}: {
  v: VisitRequest;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [rooms, setRooms] = useState<RoomAvailability[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function search() {
    setSearchError(null);
    setSearching(true);
    const res = await findAvailableBeds({
      installationId: v.installation_id ?? "",
      from: v.depart_date,
      to: v.return_date || v.depart_date,
      gender: v.gender,
    });
    setSearching(false);
    if (!res.ok) setSearchError(res.error ?? "Search failed.");
    else setRooms(res.rooms ?? []);
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", VISIT_STYLE[v.status])}>
          {VISIT_STATUS_LABEL[v.status]}
        </span>
        <span className="font-medium">{v.visitor_name}</span>
        <span className="text-xs text-muted-foreground">
          {VISITOR_TYPE_LABEL[v.visitor_type]}
          {v.visitor_company ? ` · ${v.visitor_company}` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {v.installation_name ?? "—"} · {v.depart_date}
          {v.return_date ? ` → ${v.return_date}` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {v.purpose ? `${v.purpose} · ` : ""}
        {v.host_name ? `Host ${v.host_name} ` : ""}
        {v.host_department ? `(${v.host_department}) · ` : ""}
        {v.accommodation_required ? "Overnight" : "Day trip"}
        {v.emergency_contact ? ` · ICE ${v.emergency_contact}` : ""}
      </p>
      {v.allocation && (
        <p className="mt-1 text-sm">
          Room: <span className="font-medium">{v.allocation.room_label}</span> ·{" "}
          {v.allocation.from_date} → {v.allocation.to_date} ({v.allocation.status})
        </p>
      )}
      {v.status === "rejected" && v.reject_reason && (
        <p className="mt-1 text-xs text-destructive">{v.reject_reason}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {v.status === "requested" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => decideVisitRequest(v.id, "approved"))}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const reason = prompt("Reason for rejection?") ?? undefined;
                run(() => decideVisitRequest(v.id, "rejected", reason));
              }}
            >
              Reject
            </Button>
          </>
        )}
        {(v.status === "approved" || v.status === "onboard") && v.accommodation_required && (
          <Button size="sm" variant="outline" disabled={searching} onClick={search}>
            {searching ? "Searching…" : v.allocation ? "Change room" : "Find a bed"}
          </Button>
        )}
        {v.status === "approved" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setVisitorMovement(v.id, "onboard"))}>
            Confirm offshore arrival
          </Button>
        )}
        {v.status === "onboard" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setVisitorMovement(v.id, "returned"))}>
            Confirm return onshore
          </Button>
        )}
      </div>

      {searchError && <p className="mt-2 text-xs text-destructive">{searchError}</p>}
      {rooms && (
        <div className="mt-2 rounded-md border p-2">
          {rooms.length === 0 ? (
            <p className="text-xs text-muted-foreground">No free beds for the full stay.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => (
                <button
                  key={r.room_id}
                  disabled={pending}
                  onClick={() =>
                    run(() => allocateVisitorBed({ visitRequestId: v.id, roomId: r.room_id }), () =>
                      setRooms(null),
                    )
                  }
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  {r.label} · {r.free_beds} free
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Dashboard({
  pob,
  accommodation,
  certAlerts,
}: {
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
  certAlerts: CertAlert[];
}) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Persons on board
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Current POB" value={pob.total} />
          <Stat label="Offshore staff" value={pob.byCategory.staff} />
          <Stat label="Visitors" value={pob.byCategory.visitor} />
          <Stat label="Arrivals today" value={pob.arrivalsToday} />
          <Stat label="Departures today" value={pob.departuresToday} />
          <Stat label="Overstayers" value={pob.overstayers.length} />
        </div>
        {pob.byInstallation.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pob.byInstallation.map((i) => {
              const over = i.capacity > 0 && i.pob > i.capacity;
              return (
                <div key={i.name} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{i.name}</span>
                    <span className={cn("font-semibold", over && "text-destructive")}>
                      {i.pob}
                      {i.capacity > 0 ? ` / ${i.capacity}` : ""}
                    </span>
                  </div>
                  {i.capacity > 0 && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full", over ? "bg-destructive" : "bg-primary")}
                        style={{ width: `${Math.min(100, (i.pob / i.capacity) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {pob.byCrew.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            By crew: {pob.byCrew.map((c) => `${c.name} ${c.pob}`).join(" · ")}
          </p>
        )}
        {pob.byLifeboat.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">Muster / lifeboat:</span>
            {pob.byLifeboat.map((l) => (
              <span
                key={l.name}
                className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800"
              >
                {l.name} · {l.pob}
              </span>
            ))}
          </div>
        )}
        {pob.overstayers.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">Overstayers (past planned return)</p>
            <ul className="mt-1 text-amber-800">
              {pob.overstayers.map((o, i) => (
                <li key={i}>
                  {o.name} — {o.installation ?? "?"} · due {o.demob_date}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Accommodation
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rooms" value={accommodation.totalRooms} />
          <Stat label="Beds (usable)" value={accommodation.totalBeds} />
          <Stat label="Occupied" value={accommodation.occupiedBeds} />
          <Stat label="Available" value={accommodation.availableBeds} />
          <Stat label="Fixed (staff)" value={accommodation.fixedBeds} />
          <Stat label="Blocked rooms" value={accommodation.blockedRooms} />
        </div>
        {accommodation.sharedRooms > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {accommodation.sharedRooms} room(s) hot-bunked — occupancy exceeds installed beds
            (day/night shift sharing).
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Certification alerts
        </h3>
        {certAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">All certifications valid for the next 30 days.</p>
        ) : (
          <div className="space-y-1">
            {certAlerts.map((a, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm",
                  a.expired ? "border-destructive/30 bg-destructive/5" : "bg-card",
                )}
              >
                <span>
                  {a.full_name} · <span className="uppercase">{a.kind}</span>
                </span>
                <span className={cn(a.expired ? "font-medium text-destructive" : "text-amber-700")}>
                  {a.expired ? "Expired" : "Expires"} {a.expiry}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function useRun() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  };
  return { pending, error, run };
}

function InstallationsPanel({ installations }: { installations: Installation[] }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Platforms, rigs, FPSOs and vessels. POB capacity drives the over-capacity warnings on the
        dashboard.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Installation</th>
              <th className="px-4 py-2 font-medium">POB capacity</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {installations.map((i) => (
              <tr key={i.id} className={cn(i.is_active === false && "opacity-60")}>
                <td className="px-4 py-2">
                  <input
                    defaultValue={i.name}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== i.name) run(() => upsertInstallation({ id: i.id, name: v, pobCapacity: i.pob_capacity }));
                    }}
                    className={field}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    defaultValue={i.pob_capacity}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== i.pob_capacity) run(() => upsertInstallation({ id: i.id, name: i.name, pobCapacity: v }));
                    }}
                    className={`${field} w-24`}
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setInstallationActive(i.id, i.is_active === false))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      i.is_active === false
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {i.is_active === false ? "Retired" : "Active"}
                  </button>
                </td>
              </tr>
            ))}
            {installations.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No installations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => upsertInstallation({ name, pobCapacity: Number(capacity) || 0 }),
            () => {
              setName("");
              setCapacity("");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Installation (Platform A, FPSO…)" required className={field} />
        <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={0} placeholder="POB capacity" className={`${field} w-32`} />
        <Button type="submit" disabled={pending}>Add installation</Button>
      </form>
    </div>
  );
}

function CrewsPanel({
  crews,
  installations,
  suggestions,
}: {
  crews: Crew[];
  installations: Installation[];
  suggestions: CrewChangeSuggestion[];
}) {
  // crew → which movement is due now (mobilise = outbound, demobilise = inbound)
  const dueByCrew = new Map(suggestions.map((s) => [s.crew_id, s.action]));
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [rotation, setRotation] = useState("14/14");
  const [transport, setTransport] = useState("");
  const [departure, setDeparture] = useState("");
  const [cycleStart, setCycleStart] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {crews.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.name}</span>
              <button
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete crew "${c.name}"? Members will be unassigned.`))
                    run(() => deleteCrew(c.id));
                }}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.installation_name ?? "No installation"} · {c.rotation_pattern || `${c.offshore_days}/${c.onshore_days}`}
              {c.transport_mode ? ` · ${c.transport_mode}` : ""}
              {c.departure_location ? ` · from ${c.departure_location}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{c.member_count} member(s)</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">
                Cycle start
                <input
                  type="date"
                  defaultValue={c.cycle_start_date ?? ""}
                  disabled={pending}
                  onBlur={(e) => {
                    if (e.target.value !== (c.cycle_start_date ?? ""))
                      run(() =>
                        upsertCrew({
                          id: c.id,
                          name: c.name,
                          offshoreDays: c.offshore_days,
                          onshoreDays: c.onshore_days,
                          cycleStartDate: e.target.value || null,
                        }),
                      );
                  }}
                  className={`mt-1 block ${field}`}
                />
              </label>
              {c.next_change_date && (
                <span className="text-xs text-muted-foreground">
                  Next change: <span className="font-medium text-foreground">{c.next_change_date}</span>
                </span>
              )}
            </div>
            {c.cycle_start_date && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => generateNextCrewChange(c.id, "out"))}
                  className={cn(
                    dueByCrew.get(c.id) === "mobilise" &&
                      "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  title={dueByCrew.get(c.id) === "mobilise" ? "Mobilisation due" : undefined}
                >
                  Generate outbound
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => generateNextCrewChange(c.id, "in"))}
                  className={cn(
                    dueByCrew.get(c.id) === "demobilise" &&
                      "border-green-600 bg-green-600 text-white hover:bg-green-700",
                  )}
                  title={dueByCrew.get(c.id) === "demobilise" ? "Demobilisation due" : undefined}
                >
                  Generate inbound
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="grid gap-2 rounded-lg border border-dashed bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const [off, on] = rotation.split("/").map((n) => parseInt(n, 10));
          run(
            () =>
              upsertCrew({
                name,
                installationId: installationId || undefined,
                rotationPattern: rotation,
                offshoreDays: off || 14,
                onshoreDays: on || off || 14,
                transportMode: transport,
                departureLocation: departure,
                cycleStartDate: cycleStart || null,
              }),
            () => {
              setName("");
              setTransport("");
              setDeparture("");
              setCycleStart("");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Crew name (Crew A)" required className={field} />
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className={field}>
          <option value="">Installation…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <input value={rotation} onChange={(e) => setRotation(e.target.value)} placeholder="Rotation (14/14)" className={field} />
        <input value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="Transport (helicopter)" className={field} />
        <input value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="Departure (Douala heliport)" className={field} />
        <label className="text-xs text-muted-foreground">
          Cycle start date
          <input value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} type="date" className={`mt-1 w-full ${field}`} />
        </label>
        <Button type="submit" disabled={pending}>Add crew</Button>
      </form>
    </div>
  );
}

const ROTATION_CELL: Record<RotationDay, string> = {
  offshore: "bg-primary",
  onshore: "bg-blue-500",
  change_out: "bg-amber-500",
  change_in: "bg-green-500",
};

function RotationCalendarPanel({ calendar }: { calendar: RotationCalendar }) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  // Label every 7th day to keep the header readable.
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" /> Offshore</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-500" /> Onshore</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500" /> Crew change (out)</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-green-500" /> Crew change (in)</span>
      </div>

      {calendar.crews.length === 0 && (
        <p className="text-sm text-muted-foreground">No active crews to plot.</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left">Crew</th>
              {calendar.days.map((d, i) => (
                <th key={d} className="px-0 py-1 text-center font-normal text-muted-foreground" style={{ minWidth: 10 }}>
                  {i % 7 === 0 ? <span className="block -rotate-0 text-[9px]">{fmt(d)}</span> : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.crews.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="sticky left-0 z-10 bg-card px-2 py-1 align-top">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {c.offshore_days}/{c.onshore_days} · {c.member_count}
                  </div>
                </td>
                {c.statuses.map((s, i) => (
                  <td key={i} className="p-0">
                    <div
                      title={`${calendar.days[i]}${s ? ` · ${s.replace("_", " ")}` : ""}`}
                      className={cn("h-6 w-[10px]", s ? ROTATION_CELL[s] : "bg-transparent")}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Bands are derived from each crew&apos;s rotation pattern and cycle start date. Set a cycle
        start on the Crew change tab to plot a crew.
      </p>
    </div>
  );
}

function RoomsPanel({ rooms, installations }: { rooms: Room[]; installations: Installation[] }) {
  const { pending, error, run } = useRun();
  const [installationId, setInstallationId] = useState("");
  const [block, setBlock] = useState("");
  const [floor, setFloor] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [beds, setBeds] = useState("2");
  const [gender, setGender] = useState<GenderRestriction>("any");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <BulkRoomImport />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Room</th>
              <th className="px-3 py-2 font-medium">Installation</th>
              <th className="px-3 py-2 font-medium">Floor</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Beds</th>
              <th className="px-3 py-2 font-medium">Gender</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rooms.map((r) => {
              const cell = "w-full rounded-md border bg-background px-2 py-1 text-xs";
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={r.block ?? ""}
                        disabled={pending}
                        placeholder="Block"
                        onBlur={(e) => {
                          if (e.target.value !== (r.block ?? "")) run(() => updateRoomFields({ id: r.id, block: e.target.value }));
                        }}
                        className={`${cell} w-16`}
                      />
                      <input
                        defaultValue={r.room_number}
                        disabled={pending}
                        onBlur={(e) => {
                          if (e.target.value !== r.room_number) run(() => updateRoomFields({ id: r.id, roomNumber: e.target.value }));
                        }}
                        className={`${cell} w-24 font-medium`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.installation_name}</td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.floor ?? ""}
                      disabled={pending}
                      placeholder="—"
                      onBlur={(e) => {
                        if (e.target.value !== (r.floor ?? "")) run(() => updateRoomFields({ id: r.id, floor: e.target.value }));
                      }}
                      className={cell}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.room_type}
                      disabled={pending}
                      onChange={(e) => run(() => updateRoomFields({ id: r.id, roomType: e.target.value }))}
                      className={`${cell} capitalize`}
                    >
                      {["single", "double", "shared", "vip", "medic"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        defaultValue={r.bed_count}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== r.bed_count) run(() => updateRoomFields({ id: r.id, bedCount: v }));
                        }}
                        className={`${cell} w-16`}
                      />
                      {r.fixed_assigned > 0 && (
                        <span className="text-[10px] text-muted-foreground">{r.fixed_assigned} fixed</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.gender_restriction}
                      disabled={pending}
                      onChange={(e) => run(() => updateRoomFields({ id: r.id, genderRestriction: e.target.value }))}
                      className={cell}
                    >
                      {(Object.keys(GENDER_LABEL) as GenderRestriction[]).map((g) => (
                        <option key={g} value={g}>{GENDER_LABEL[g]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      disabled={pending}
                      onChange={(e) => run(() => setRoomStatus(r.id, e.target.value))}
                      className={cell}
                    >
                      {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                        <option key={s} value={s}>{ROOM_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {rooms.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No rooms yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        className="grid gap-2 rounded-lg border border-dashed bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              upsertRoom({
                installationId,
                block,
                floor,
                roomNumber,
                roomType,
                bedCount: Number(beds),
                maxBedCount: Number(beds),
                genderRestriction: gender,
              }),
            () => {
              setRoomNumber("");
              setBlock("");
              setFloor("");
            },
          );
        }}
      >
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} required className={field}>
          <option value="">Installation…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Block (optional)" className={field} />
        <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Floor / location" className={field} />
        <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Room no. (A-203)" required className={field} />
        <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className={`${field} capitalize`}>
          {["single", "double", "shared", "vip", "medic"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input value={beds} onChange={(e) => setBeds(e.target.value)} type="number" min={0} placeholder="Beds" className={field} />
        <select value={gender} onChange={(e) => setGender(e.target.value as GenderRestriction)} className={field}>
          {(Object.keys(GENDER_LABEL) as GenderRestriction[]).map((g) => (
            <option key={g} value={g}>{GENDER_LABEL[g]}</option>
          ))}
        </select>
        <Button type="submit" disabled={pending}>Add room</Button>
      </form>
    </div>
  );
}

function RosterPanel({
  roster,
  crews,
  rooms,
  addable,
}: {
  roster: RosterEntry[];
  crews: Crew[];
  rooms: Room[];
  addable: { id: string; full_name: string }[];
}) {
  const { pending, error, run } = useRun();
  const [newId, setNewId] = useState("");

  function expired(date: string | null) {
    return date ? new Date(date) < new Date() : false;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-card/50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addRosterMember(newId), () => setNewId(""));
        }}
      >
        <span className="text-sm font-medium">Add to roster:</span>
        <select value={newId} onChange={(e) => setNewId(e.target.value)} required className={field}>
          <option value="">Choose person…</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending || !newId}>Add</Button>
      </form>

      <BulkRosterImport />

      <div className="space-y-3">
        {roster.map((m) => (
          <div key={m.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.full_name || m.email}</span>
              {!m.travel_eligible && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                  Not eligible
                </span>
              )}
              {m.crew_name && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {m.crew_name}
                </span>
              )}
              {m.company && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {m.company}
                </span>
              )}
              {m.fixed_room_label && (
                <span className="text-xs text-muted-foreground">
                  Room {m.fixed_room_label}
                  {m.fixed_bed ? ` · ${m.fixed_bed}` : ""}
                </span>
              )}
              {m.lifeboat && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  {m.lifeboat}
                </span>
              )}
              {m.back_to_back_name && (
                <span className="text-xs text-muted-foreground">B2B: {m.back_to_back_name}</span>
              )}
              <button
                disabled={pending}
                onClick={() => run(() => removeRosterMember(m.id))}
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={m.crew_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateRosterMember({ id: m.id, crewId: e.target.value || null }))}
                className={field}
              >
                <option value="">Crew…</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                defaultValue={m.position ?? ""}
                disabled={pending}
                placeholder="Position"
                onBlur={(e) => {
                  if (e.target.value !== (m.position ?? "")) run(() => updateRosterMember({ id: m.id, position: e.target.value }));
                }}
                className={field}
              />
              <input
                defaultValue={m.company ?? ""}
                disabled={pending}
                placeholder="Company (APCC, TEFON…)"
                onBlur={(e) => {
                  if (e.target.value !== (m.company ?? "")) run(() => updateRosterMember({ id: m.id, company: e.target.value }));
                }}
                className={field}
              />
              <select
                value={m.back_to_back_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateRosterMember({ id: m.id, backToBackId: e.target.value || null }))}
                className={field}
              >
                <option value="">Back-to-back…</option>
                {roster
                  .filter((o) => o.profile_id !== m.profile_id)
                  .map((o) => (
                    <option key={o.profile_id} value={o.profile_id}>
                      {o.full_name || o.email}
                    </option>
                  ))}
              </select>
              <select
                value={m.fixed_room_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateRosterMember({ id: m.id, fixedRoomId: e.target.value || null }))}
                className={field}
              >
                <option value="">Fixed room…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.block, r.room_number].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
              <input
                defaultValue={m.fixed_bed ?? ""}
                disabled={pending}
                placeholder="Fixed bed (Bed 1)"
                onBlur={(e) => {
                  if (e.target.value !== (m.fixed_bed ?? "")) run(() => updateRosterMember({ id: m.id, fixedBed: e.target.value }));
                }}
                className={field}
              />
              <input
                defaultValue={m.lifeboat ?? ""}
                disabled={pending}
                placeholder="Muster / lifeboat (LB-1)"
                onBlur={(e) => {
                  if (e.target.value !== (m.lifeboat ?? "")) run(() => updateRosterMember({ id: m.id, lifeboat: e.target.value }));
                }}
                className={field}
              />
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <CertInput label="Medical" value={m.medical_expiry} expired={expired(m.medical_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, medicalExpiry: v }))} />
              <CertInput label="BOSIET" value={m.bosiet_expiry} expired={expired(m.bosiet_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, bosietExpiry: v }))} />
              <CertInput label="HUET" value={m.huet_expiry} expired={expired(m.huet_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, huetExpiry: v }))} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.travel_eligible}
                  disabled={pending}
                  onChange={(e) => run(() => updateRosterMember({ id: m.id, travelEligible: e.target.checked }))}
                />
                Travel eligible
              </label>
            </div>
          </div>
        ))}
        {roster.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No offshore staff on the roster yet.
          </p>
        )}
      </div>
    </div>
  );
}

function CertInput({
  label,
  value,
  expired,
  onSave,
}: {
  label: string;
  value: string | null;
  expired: boolean;
  onSave: (v: string) => void;
}) {
  return (
    <label className={cn("text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
      {label} expiry{expired ? " (expired)" : ""}
      <input
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          if (e.target.value !== (value ?? "")) onSave(e.target.value);
        }}
        className={cn(field, "mt-1 w-full", expired && "border-destructive")}
      />
    </label>
  );
}
