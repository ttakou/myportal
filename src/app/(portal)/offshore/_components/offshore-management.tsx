"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStatusTransition } from "@/components/activity";
import {
  AlertTriangle,
  Anchor,
  BedDouble,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  FileText,
  History,
  ChevronDown,
  LayoutGrid,
  Plane,
  Trash2,
  Users,
  UserCog,
  UtensilsCrossed,
  LifeBuoy,
  Siren,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import type { Installation } from "@/types/offshore";
import {
  GENDER_LABEL,
  MANIFEST_STATUS_LABEL,
  ROOM_STATUS_LABEL,
  TRIP_TYPE_LABEL,
  VISIT_STATUS_LABEL,
  VISITOR_TYPE_LABEL,
  EMERGENCY_ROLE_LABEL,
  type EmergencyRole,
  type EmergencyRoleKind,
  type MusterDrill,
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
  assignToCrew,
  autoAssignBySchedule,
  confirmManifestMovement,
  decideVisitRequest,
  decideVisitGroup,
  boardMember,
  deleteCrew,
  deleteEmergencyWindow,
  setEmergencyRole,
  startMusterDrill,
  setMusterCheckin,
  endMusterDrill,
  offboardTrip,
  reassignTripRoom,
  setBackToBack,
  setRoomDefaultOwners,
  setAllRoomDefaults,
  setTripCategory,
  findAvailableBeds,
  createManifest,
  generateNextCrewChange,
  removeManifestPax,
  reverseManifestPax,
  removeRosterMember,
  setInstallationActive,
  setManifestStatus,
  setRoomStatus,
  setVisitorMovement,
  togglePaxNoShow,
  updateManifestTransport,
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
  | "emergency"
  | "drill"
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
  emergencyRoles: EmergencyRole[];
  musterGroups: string[];
  musterDrill: MusterDrill | null;
  musterDrillHistory: MusterDrillSummary[];
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
    { key: "emergency", label: "Muster roles", icon: LifeBuoy },
    { key: "drill", label: "Muster drill", icon: Siren, badge: props.musterDrill ? 1 : undefined },
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
        <Dashboard
          pob={props.pob}
          accommodation={props.accommodation}
          certAlerts={props.certAlerts}
          crews={props.crews}
          rooms={props.rooms}
          roster={props.roster}
        />
      )}
      {tab === "installations" && <InstallationsPanel installations={props.manageInstallations} />}
      {tab === "crews" && (
        <CrewsPanel crews={props.crews} installations={props.installations} suggestions={props.suggestions} />
      )}
      {tab === "calendar" && <RotationCalendarPanel calendar={props.calendar} crews={props.crews} />}
      {tab === "rooms" && (
        <RoomsPanel rooms={props.rooms} installations={props.installations} roster={props.roster} />
      )}
      {tab === "roster" && (
        <RosterPanel
          roster={props.roster}
          crews={props.crews}
          rooms={props.rooms}
          addable={props.addable}
        />
      )}
      {tab === "visitors" && <VisitorsPanel visits={props.visits} />}
      {tab === "manifests" && (
        <ManifestsPanel
          manifests={props.manifests}
          crews={props.crews}
          roster={props.roster}
          onboard={props.pob.people}
          visits={props.visits}
        />
      )}
      {tab === "assign" && <CrewAssign employees={props.employees} crews={props.crews} />}
      {tab === "catering" && <CateringPanel installations={props.installations} />}
      {tab === "emergency" && (
        <EmergencyRolesPanel
          roles={props.emergencyRoles}
          musterGroups={props.musterGroups}
          roster={props.roster}
        />
      )}
      {tab === "drill" && <MusterDrillPanel drill={props.musterDrill} history={props.musterDrillHistory} />}
      {tab === "history" && <HistoryPanel />}
    </div>
  );
}

const EMERGENCY_ORDER: EmergencyRoleKind[] = [
  "evac_leader",
  "evac_assistant",
  "headcount_principal",
  "headcount_assistant",
];

/** Per rotation window + muster group: evacuation & head-count role holders. */
function EmergencyRolesPanel({
  roles,
  musterGroups,
  roster,
}: {
  roles: EmergencyRole[];
  musterGroups: string[];
  roster: RosterEntry[];
}) {
  const { pending, error, run } = useRun();
  const today = new Date().toISOString().slice(0, 10);

  const windows = useMemo(() => {
    const seen = new Map<string, { from: string; to: string }>();
    for (const r of roles) {
      const k = r.from_date + "|" + r.to_date;
      if (!seen.has(k)) seen.set(k, { from: r.from_date, to: r.to_date });
    }
    return [...seen.values()].sort((a, b) => b.from.localeCompare(a.from));
  }, [roles]);

  const [from, setFrom] = useState(windows[0]?.from ?? today);
  const [to, setTo] = useState(windows[0]?.to ?? today);

  const groups = musterGroups.length
    ? musterGroups
    : [...new Set(roles.map((r) => r.lifeboat))].sort() ;
  const people = [...roster]
    .map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const holder = (group: string, role: EmergencyRoleKind) =>
    roles.find(
      (r) => r.from_date === from && r.to_date === to && r.lifeboat === group && r.role === role,
    )?.profile_id ?? "";

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Evacuation &amp; head-count leaders per muster group, fixed for a rotation window (they stay
        the same across the crews aboard).
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-3">
        <label className="text-xs text-muted-foreground">
          Rotation from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        {windows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Existing:</span>
            {windows.map((w) => (
              <button
                key={w.from + w.to}
                onClick={() => { setFrom(w.from); setTo(w.to); }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent",
                  from === w.from && to === w.to && "ring-1 ring-primary",
                )}
              >
                {w.from} → {w.to}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No muster groups configured. Set a room&apos;s muster (Accommodation tab) first.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g} className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{g}</span>
                <span className="text-xs text-muted-foreground">muster group</span>
              </div>
              <div className="grid gap-2">
                {EMERGENCY_ORDER.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">{EMERGENCY_ROLE_LABEL[role]}</span>
                    <LazySelect
                      value={holder(g, role) || null}
                      options={people}
                      getOptionValue={(p) => p.id}
                      getOptionLabel={(p) => p.name}
                      placeholder="— none —"
                      disabled={pending || !from || !to}
                      className={cn(field, "flex-1 py-1")}
                      onChange={(v) =>
                        run(() => setEmergencyRole({ fromDate: from, toDate: to, lifeboat: g, role, profileId: v }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {windows.some((w) => w.from === from && w.to === to) && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm(`Clear all muster roles for ${from} → ${to}?`))
              run(() => deleteEmergencyWindow(from, to));
          }}
        >
          Clear this window
        </Button>
      )}
    </div>
  );
}

type MusterDrillSummary = {
  id: string;
  started_at: string;
  ended_at: string | null;
  kind: string;
  total: number;
  accounted: number;
};

/** Past roll-calls (archive) with links to each report. */
function MusterArchive({ history }: { history: MusterDrillSummary[] }) {
  const past = history.filter((d) => d.ended_at);
  if (past.length === 0) return null;
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">Past roll-calls</div>
      <ul className="divide-y text-sm">
        {past.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
            <span className="font-medium">
              {new Date(d.started_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                d.kind === "real" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {d.kind === "real" ? "Emergency" : "Drill"}
            </span>
            <span className={cn("text-xs", d.accounted < d.total ? "text-destructive" : "text-green-700")}>
              {d.accounted}/{d.total} accounted
            </span>
            <a
              href={`/offshore-muster/${d.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
            >
              <FileText className="h-3.5 w-3.5" /> Report
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live emergency muster roll-call: tick off who's accounted per muster group. */
function MusterDrillPanel({ drill, history }: { drill: MusterDrill | null; history: MusterDrillSummary[] }) {
  const { pending, error, run } = useRun();
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!drill) return;
    const start = new Date(drill.started_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [drill]);

  if (!drill) {
    return (
      <div className="space-y-3">
        {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
        <p className="text-sm text-muted-foreground">
          Start a roll-call to snapshot everyone on board and check them off at their muster station.
        </p>
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => run(() => startMusterDrill("drill"))}>
            <Siren className="h-4 w-4" /> Start drill roll-call
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (confirm("Start a REAL emergency roll-call?")) run(() => startMusterDrill("real"));
            }}
          >
            Real emergency
          </Button>
        </div>
        <MusterArchive history={history} />
      </div>
    );
  }

  const groups = new Map<string, typeof drill.checkins>();
  for (const c of drill.checkins) {
    const g = c.lifeboat || "Unassigned";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const total = drill.checkins.length;
  const accounted = drill.checkins.filter((c) => c.accounted).length;
  const unaccounted = total - accounted;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border p-3",
          drill.kind === "real" ? "border-destructive bg-destructive/5" : "bg-card",
        )}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Siren className={cn("h-4 w-4", drill.kind === "real" && "text-destructive")} />
          {drill.kind === "real" ? "EMERGENCY roll-call" : "Drill roll-call"}
        </span>
        <span className="font-mono text-lg tabular-nums">{elapsed}</span>
        <span className="text-sm">
          <span className="font-semibold text-green-700">{accounted}</span> accounted ·{" "}
          <span className={cn("font-semibold", unaccounted > 0 ? "text-destructive" : "text-muted-foreground")}>
            {unaccounted}
          </span>{" "}
          unaccounted · {total} POB
        </span>
        <a
          href={`/offshore-muster/${drill.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </a>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm("End this roll-call?")) run(() => endMusterDrill(drill.id));
          }}
        >
          End roll-call
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {[...groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([g, people]) => {
            const acc = people.filter((p) => p.accounted).length;
            return (
              <div key={g} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{g}</span>
                  <span className="text-xs text-muted-foreground">
                    {acc}/{people.length} accounted
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {people.map((p) => (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm",
                          p.accounted ? "bg-green-50 text-green-900" : "hover:bg-accent",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={p.accounted}
                          disabled={pending}
                          onChange={(e) => run(() => setMusterCheckin(p.id, e.target.checked))}
                        />
                        <span className={cn(p.accounted && "line-through opacity-70")}>{p.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
      </div>

      <MusterArchive history={history} />
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

/** Build a manifest: pick mode + date, then move passengers from left to right. */
type PickItem = { key: string; id: string; name: string; kind: "staff" | "visitor"; crew_id: string | null };

function ManifestBuilder({
  crews,
  roster,
  onboard,
  visits,
  pending,
  run,
}: {
  crews: Crew[];
  roster: RosterEntry[];
  onboard: PobBreakdown["people"];
  visits: VisitRequest[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [mode, setMode] = useState<"helicopter" | "boat">("boat");
  const [crewId, setCrewId] = useState("");
  const [date, setDate] = useState("");
  const [seats, setSeats] = useState(24);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PickItem[]>([]);

  const pickedKeys = new Set(picked.map((p) => p.key));

  // Staff pool: inbound (out) = roster ashore; outbound (in) = on-board staff.
  const staff: PickItem[] =
    direction === "out"
      ? roster
          .filter((m) => !onboard.some((o) => o.profile_id === m.profile_id))
          .map((m) => ({ key: "s" + m.profile_id, id: m.profile_id, name: m.full_name || m.email, kind: "staff" as const, crew_id: m.crew_id }))
      : onboard
          .filter((o) => o.profile_id)
          .map((o) => ({ key: "s" + o.profile_id, id: o.profile_id as string, name: o.name, kind: "staff" as const, crew_id: o.crew_id }));

  // Visitor pool: inbound = approved (due to travel out); outbound = currently on board.
  const visitorStatus = direction === "out" ? "approved" : "onboard";
  const visitorPool: PickItem[] = visits
    .filter((v) => v.status === visitorStatus)
    .map((v) => ({ key: "v" + v.id, id: v.id, name: `${v.visitor_name} (visitor)`, kind: "visitor" as const, crew_id: null }));

  const candidates = [...staff, ...visitorPool]
    .filter((c) => !crewId || c.crew_id === crewId)
    .filter((c) => !pickedKeys.has(c.key))
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Pre-fill the manifest from the chosen crew + direction: inbound pulls the
  // crew's staff ashore (due to mobilise); outbound pulls the crew's staff on
  // board (due to demobilise). Cleared when no crew is selected. The planner can
  // still add/remove anyone before creating.
  useEffect(() => {
    if (!crewId) {
      setPicked([]);
      return;
    }
    const pool: PickItem[] =
      direction === "out"
        ? roster
            .filter((m) => m.crew_id === crewId && !onboard.some((o) => o.profile_id === m.profile_id))
            .map((m) => ({ key: "s" + m.profile_id, id: m.profile_id, name: m.full_name || m.email, kind: "staff" as const, crew_id: m.crew_id }))
        : onboard
            .filter((o) => o.profile_id && o.crew_id === crewId)
            .map((o) => ({ key: "s" + o.profile_id, id: o.profile_id as string, name: o.name, kind: "staff" as const, crew_id: o.crew_id }));
    setPicked(pool);
    // roster/onboard are stable props; re-fill only when crew or direction changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewId, direction]);

  const setModeAndSeats = (m: "helicopter" | "boat") => {
    setMode(m);
    setSeats(m === "boat" ? 24 : 12);
  };
  const reset = () => {
    setPicked([]);
    setDate("");
    setSearch("");
  };
  const submit = () =>
    run(
      () =>
        createManifest({
          crewId: crewId || null,
          direction,
          transportMode: mode,
          scheduledDate: date,
          seatCapacity: seats,
          profileIds: picked.filter((p) => p.kind === "staff").map((p) => p.id),
          visitRequestIds: picked.filter((p) => p.kind === "visitor").map((p) => p.id),
        }),
      reset,
    );

  const over = picked.length > seats;

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-card/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in")} className={cn(field, "mt-0.5 block py-1")}>
            <option value="out">Inbound — joining (mobilise)</option>
            <option value="in">Outbound — leaving (demobilise)</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Mode
          <select value={mode} onChange={(e) => setModeAndSeats(e.target.value as "helicopter" | "boat")} className={cn(field, "mt-0.5 block py-1")}>
            <option value="helicopter">Helicopter</option>
            <option value="boat">Boat</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Crew (filter)
          <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={cn(field, "mt-0.5 block py-1")}>
            <option value="">All crews</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Seats
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value) || 1)} className={cn(field, "mt-0.5 block w-20 py-1")} />
        </label>
      </div>

      {crewId ? (
        <p className="text-[11px] text-muted-foreground">
          Pre-filled with <span className="font-medium">{crews.find((c) => c.id === crewId)?.name}</span>{" "}
          {direction === "out" ? "joining (mobilise)" : "leaving (demobilise)"} — add or remove anyone before creating.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Pick a crew to auto-fill the manifest from the crew change, or add people manually.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {/* Available */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-2 py-1">
            <span className="text-xs font-semibold">Available ({candidates.length})</span>
            <button
              type="button"
              disabled={pending || candidates.length === 0}
              onClick={() => setPicked((cur) => [...cur, ...candidates])}
              className="text-[11px] text-primary hover:underline disabled:opacity-50"
            >
              Add all
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full border-b px-2 py-1 text-xs outline-none"
          />
          <ul className="max-h-64 overflow-y-auto p-1">
            {candidates.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setPicked((cur) => [...cur, c])}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <span>{c.name}</span>
                  <span className="text-muted-foreground">+</span>
                </button>
              </li>
            ))}
            {candidates.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">No one to add.</li>}
          </ul>
        </div>

        {/* Selected */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-2 py-1">
            <span className={cn("text-xs font-semibold", over && "text-destructive")}>
              Manifest ({picked.length}/{seats}){over ? " · over capacity" : ""}
            </span>
            <button
              type="button"
              disabled={pending || picked.length === 0}
              onClick={() => setPicked([])}
              className="text-[11px] text-muted-foreground hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {picked.map((p, i) => (
              <li key={p.key}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setPicked((cur) => cur.filter((x) => x.key !== p.key))}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-destructive/10"
                >
                  <span><span className="mr-1 tabular-nums text-muted-foreground/70">{i + 1}.</span>{p.name}</span>
                  <span className="text-muted-foreground">×</span>
                </button>
              </li>
            ))}
            {picked.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">Click people on the left to add.</li>}
          </ul>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled={pending || !date || picked.length === 0} onClick={submit}>
          Create manifest ({picked.length})
        </Button>
      </div>
    </div>
  );
}

function ManifestsPanel({
  manifests,
  crews,
  roster,
  onboard,
  visits,
}: {
  manifests: Manifest[];
  crews: Crew[];
  roster: RosterEntry[];
  onboard: PobBreakdown["people"];
  visits: VisitRequest[];
}) {
  const { pending, error, run } = useRun();

  const active = manifests.filter((m) => m.status !== "completed" && m.status !== "cancelled");
  const history = manifests.filter((m) => m.status === "completed" || m.status === "cancelled");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <ManifestBuilder crews={crews} roster={roster} onboard={onboard} visits={visits} pending={pending} run={run} />

      <div className="space-y-3">
        {active.map((m) => (
          <ManifestCard key={m.id} m={m} pending={pending} run={run} />
        ))}
        {active.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No active or upcoming manifests.
          </p>
        )}
      </div>

      <ManifestHistory history={history} crews={crews} pending={pending} run={run} />
    </div>
  );
}

/** Collapsible archive of completed & cancelled manifests, with filters. */
function ManifestHistory({
  history,
  crews,
  pending,
  run,
}: {
  history: Manifest[];
  crews: Crew[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "cancelled">("all");
  const [crewId, setCrewId] = useState("");

  const filtered = history
    .filter((m) => status === "all" || m.status === status)
    .filter((m) => !crewId || m.crew_id === crewId)
    .filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        (m.installation_name ?? "").toLowerCase().includes(q) ||
        (m.crew_name ?? "").toLowerCase().includes(q) ||
        m.scheduled_date.includes(q)
      );
    });

  const csvHref =
    "/offshore-export?type=manifest-history" +
    (status !== "all" ? `&status=${status}` : "") +
    (crewId ? `&crew=${crewId}` : "");

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
      >
        <History className="h-4 w-4 text-muted-foreground" />
        History
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {history.length}
        </span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t p-3">
          {history.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-muted-foreground">
              No completed or cancelled manifests yet.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, crew, installation, date…"
                  className={cn(field, "min-w-[14rem] flex-1 py-1")}
                />
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={cn(field, "py-1")}>
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={cn(field, "py-1")}>
                  <option value="">All crews</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <a
                  href={csvHref}
                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <FileText className="h-3.5 w-3.5" /> Export CSV
                </a>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Showing {filtered.length} of {history.length}
              </p>

              <div className="space-y-3">
                {filtered.map((m) => (
                  <ManifestCard key={m.id} m={m} pending={pending} run={run} />
                ))}
                {filtered.length === 0 && (
                  <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
                    No manifests match your filters.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
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
  const canEditTransport = m.status !== "completed" && m.status !== "cancelled";

  const [editingTransport, setEditingTransport] = useState(false);
  const [editMode, setEditMode] = useState<"helicopter" | "boat">(
    m.transport_mode === "helicopter" ? "helicopter" : "boat",
  );
  const [editSeats, setEditSeats] = useState(m.seat_capacity);

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
        {canEditTransport && !editingTransport && (
          <button
            type="button"
            onClick={() => setEditingTransport(true)}
            className="rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
          >
            Seats / transport
          </button>
        )}
        <a
          href={`/offshore-manifest/${m.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </a>
      </div>

      {editingTransport && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-card/50 p-2">
          <label className="text-[11px] text-muted-foreground">
            Transport
            <select
              value={editMode}
              onChange={(e) => {
                const mode = e.target.value as "helicopter" | "boat";
                setEditMode(mode);
                setEditSeats(mode === "boat" ? 24 : 12);
              }}
              className={cn(field, "mt-0.5 block py-1")}
            >
              <option value="boat">Boat</option>
              <option value="helicopter">Helicopter</option>
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">
            Seats
            <input
              type="number"
              min={1}
              value={editSeats}
              onChange={(e) => setEditSeats(Number(e.target.value) || 1)}
              className={cn(field, "mt-0.5 block w-20 py-1")}
            />
          </label>
          {editSeats < travelling.length && (
            <span className="text-[11px] text-destructive">Below the {travelling.length} travelling.</span>
          )}
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => updateManifestTransport({ id: m.id, transportMode: editMode, seatCapacity: editSeats }),
                () => setEditingTransport(false),
              )
            }
          >
            Save
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditingTransport(false)}>
            Cancel
          </Button>
        </div>
      )}

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
            {m.status === "completed" && !p.no_show && (
              <button
                disabled={pending}
                title="Reverse this person if the journey didn't complete"
                onClick={() => {
                  const msg =
                    m.direction === "out"
                      ? `${p.person_name} did not arrive at the installation? They'll be taken back off POB.`
                      : `${p.person_name} stayed aboard (didn't reach shore)? They'll be put back on POB.`;
                  if (confirm(msg)) run(() => reverseManifestPax({ paxId: p.id }));
                }}
                className="ml-auto rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                {m.direction === "out" ? "Did not arrive" : "Returned aboard"}
              </button>
            )}
          </div>
        ))}
        {m.pax.length === 0 && <p className="text-xs text-muted-foreground">No passengers.</p>}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {m.status !== "completed" && m.status !== "cancelled" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              const verb = m.direction === "out" ? "board (mobilise)" : "demob (offboard)";
              if (confirm(`Approve this manifest? ${travelling.length} passenger(s) will be ${verb}.`))
                run(() => confirmManifestMovement(m.id));
            }}
          >
            Approve &amp; {m.direction === "out" ? "board" : "demob"}
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

/** Group visit requests by their shared group_id (legacy single requests stand alone). */
function groupVisits(list: VisitRequest[]): VisitRequest[][] {
  const map = new Map<string, VisitRequest[]>();
  const order: string[] = [];
  for (const v of list) {
    const k = v.group_id ?? v.id;
    if (!map.has(k)) {
      map.set(k, []);
      order.push(k);
    }
    map.get(k)!.push(v);
  }
  return order.map((k) => map.get(k)!);
}

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
        {groupVisits(open).map((g) => {
          const head = g[0];
          const grouped = g.length > 1 || head.group_id != null;
          const pendingDecision = head.status === "requested";
          return (
            <div key={head.group_id ?? head.id} className={cn(grouped && "rounded-lg border bg-card/50 p-2")}>
              {grouped && (
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                  <span className="text-sm font-medium">
                    {g.length} visitor(s) · {head.purpose ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {head.installation_name ?? "—"} · {head.depart_date}
                    {head.host_name ? ` · host ${head.host_name}` : ""}
                  </span>
                  {pendingDecision && (
                    <span className="ml-auto flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            head.group_id
                              ? decideVisitGroup(head.group_id, "approved")
                              : decideVisitRequest(head.id, "approved"),
                          )
                        }
                      >
                        Approve request
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          const reason = prompt("Reason for rejection?") ?? undefined;
                          run(() =>
                            head.group_id
                              ? decideVisitGroup(head.group_id, "rejected", reason)
                              : decideVisitRequest(head.id, "rejected", reason),
                          );
                        }}
                      >
                        Reject
                      </Button>
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-3">
                {g.map((v) => (
                  <VisitorCard key={v.id} v={v} pending={pending} run={run} hideDecision={grouped} />
                ))}
              </div>
            </div>
          );
        })}
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
  hideDecision,
}: {
  v: VisitRequest;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
  hideDecision?: boolean;
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
        {v.status === "requested" && !hideDecision && (
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

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "green";
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", tone === "green" && "border-green-300 bg-green-50")}>
      <div className={cn("text-2xl font-semibold", tone === "green" && "text-green-700")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function DrillCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">{children}</div>
    </div>
  );
}

/** Parse a rotation pattern like "28/28" or "28" into offshore/onshore day counts. */
function parsePattern(pattern: string, start: string, end: string): { off: number; on: number } | null {
  const parts = pattern.split("/").map((n) => parseInt(n.trim(), 10));
  if (parts[0] > 0) {
    const off = parts[0];
    const on = parts[1] > 0 ? parts[1] : off;
    return { off, on };
  }
  // No pattern: derive offshore length from the start/end dates (onshore = same).
  if (start && end) {
    const days = Math.round(
      (new Date(end + "T00:00:00Z").getTime() - new Date(start + "T00:00:00Z").getTime()) / 86400000,
    ) + 1;
    if (days > 0) return { off: days, on: days };
  }
  return null;
}

/** Shared cycle-start + pattern form that auto-groups people into a crew. */
function RotationForm({
  profileIds,
  label,
  onDone,
}: {
  profileIds: string[];
  label: string;
  onDone?: () => void;
}) {
  const { pending, error, run } = useRun();
  const [start, setStart] = useState("");
  const [pattern, setPattern] = useState("28/28");
  const [end, setEnd] = useState("");

  function apply() {
    const parsed = parsePattern(pattern, start, end);
    if (!start || !parsed) return;
    run(
      () =>
        autoAssignBySchedule({
          profileIds,
          offshoreDays: parsed.off,
          onshoreDays: parsed.on,
          cycleStartDate: start,
          autoName: true,
        }),
      onDone,
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-card/50 p-2 text-xs">
      <label className="text-muted-foreground">
        Cycle start
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
      </label>
      <label className="text-muted-foreground">
        Recurring (off/on)
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="28/28" className={cn(field, "mt-0.5 block w-24 py-1")} />
      </label>
      <label className="text-muted-foreground">
        End shift (opt.)
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
      </label>
      <Button size="sm" disabled={pending || !start || !profileIds.length} onClick={apply}>
        {label}
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}

/** Top-of-list bulk control: apply one rotation to every unassigned person. */
function BulkSchedule({ profileIds }: { profileIds: string[] }) {
  const [open, setOpen] = useState(false);
  if (!profileIds.length) return null;
  return (
    <div className="mb-2 border-b pb-2">
      {open ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Apply one rotation to all {profileIds.length} unassigned (same schedule → one crew):</p>
          <RotationForm profileIds={profileIds} label={`Apply to all ${profileIds.length}`} onDone={() => setOpen(false)} />
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-primary hover:underline">
          + Apply a rotation to all {profileIds.length} at once
        </button>
      )}
    </div>
  );
}

/** One unassigned person: quick crew pick + an expandable rotation scheduler. */
function UnassignedRow({ person, crews }: { person: PobBreakdown["people"][number]; crews: Crew[] }) {
  const { pending, run } = useRun();
  const [sched, setSched] = useState(false);
  const p = person;

  return (
    <div className="border-b py-1.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.name}</span>
        {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
        {p.room_label && (
          <span className="text-xs text-muted-foreground">
            {p.room_label}{p.bed_no ? ` · ${p.bed_no}` : ""}
          </span>
        )}
        {p.lifeboat && <span className="rounded bg-sky-100 px-1.5 text-[10px] text-sky-800">{p.lifeboat}</span>}
        {p.category === "visitor" && (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">Visitor</span>
        )}
        {p.profile_id && (
          <span className="ml-auto flex items-center gap-1">
            {p.category === "visitor" ? (
              <button
                disabled={pending}
                onClick={() => run(() => setTripCategory(p.trip_id, "staff"))}
                className="rounded border px-1.5 py-1 text-xs hover:bg-accent"
              >
                Make staff
              </button>
            ) : (
              <>
                <button
                  disabled={pending}
                  onClick={() => run(() => setTripCategory(p.trip_id, "visitor"))}
                  className="rounded border px-1.5 py-1 text-xs hover:bg-accent"
                  title="Count this person as a visitor, not crew"
                >
                  Visitor
                </button>
                <button
                  onClick={() => setSched((s) => !s)}
                  className={cn("rounded border px-1.5 py-1 text-xs hover:bg-accent", sched && "bg-accent")}
                >
                  Rotation
                </button>
                <select
                  defaultValue={p.crew_id ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => assignToCrew([p.profile_id as string], e.target.value || null))}
                  className={cn(field, "py-1 text-xs")}
                >
                  <option value="">No crew…</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            )}
          </span>
        )}
      </div>
      {sched && p.category !== "visitor" && p.profile_id && (
        <div className="mt-1.5">
          <RotationForm profileIds={[p.profile_id]} label="Schedule & assign" onDone={() => setSched(false)} />
        </div>
      )}
    </div>
  );
}

type Drill = { type: "crew" | "lb"; key: string } | { type: "rooms" } | null;

function Dashboard({
  pob,
  accommodation,
  certAlerts,
  crews,
  rooms,
  roster,
}: {
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
  certAlerts: CertAlert[];
  crews: Crew[];
  rooms: Room[];
  roster: RosterEntry[];
}) {
  const { pending, error, run } = useRun();
  const [drill, setDrill] = useState<Drill>(null);

  const isOpen = (d: NonNullable<Drill>) =>
    drill?.type === d.type && ("key" in d ? "key" in drill && drill.key === d.key : true);
  const toggle = (d: NonNullable<Drill>) => setDrill((cur) => (isOpen(d) ? null : d));

  const unassigned = pob.people.filter((p) => !p.crew_id);

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Persons on board
          </h3>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (confirm("Start a muster roll-call for everyone on board?"))
                run(() => startMusterDrill("drill"));
            }}
          >
            <Siren className="h-4 w-4" /> Start muster roll-call
          </Button>
        </div>
        {error && <p className="mb-2 rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">{error}</p>}
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">By crew:</span>
            {pob.byCrew.map((c) => (
              <button
                key={c.name}
                onClick={() => toggle({ type: "crew", key: c.name })}
                className={cn(
                  "rounded-full border px-2 py-0.5 font-medium hover:bg-accent",
                  c.name === "Unassigned" && "border-amber-300 bg-amber-50 text-amber-800",
                  isOpen({ type: "crew", key: c.name }) && "ring-1 ring-primary",
                )}
              >
                {c.name} · {c.pob}
              </button>
            ))}
          </div>
        )}
        {pob.byLifeboat.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">Muster / lifeboat:</span>
            {pob.byLifeboat.map((l) => (
              <button
                key={l.name}
                onClick={() => toggle({ type: "lb", key: l.name })}
                className={cn(
                  "rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800 hover:bg-sky-200",
                  isOpen({ type: "lb", key: l.name }) && "ring-1 ring-sky-500",
                )}
              >
                {l.name} · {l.pob}
              </button>
            ))}
          </div>
        )}

        {/* Drill-down: crew member list (with assign + scheduling for the unassigned) */}
        {drill?.type === "crew" && drill.key === "Unassigned" && (
          <DrillCard
            title={`Unassigned on board — assign to a crew (${unassigned.length})`}
            onClose={() => setDrill(null)}
          >
            <BulkSchedule
              profileIds={unassigned.map((p) => p.profile_id).filter((x): x is string => Boolean(x))}
            />
            {unassigned.map((p) => (
              <UnassignedRow key={p.trip_id} person={p} crews={crews} />
            ))}
          </DrillCard>
        )}
        {drill?.type === "crew" && drill.key !== "Unassigned" && (() => {
          const onboard = pob.people.filter((p) => p.crew_name === drill.key);
          const onboardIds = new Set(onboard.map((p) => p.profile_id).filter(Boolean));
          const ashore = roster.filter((m) => m.crew_name === drill.key && !onboardIds.has(m.profile_id));
          return (
            <DrillCard
              title={`${drill.key} — ${onboard.length} on board · ${ashore.length} ashore`}
              onClose={() => setDrill(null)}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                On board ({onboard.length})
              </p>
              {onboard.map((p) => (
                <div key={p.trip_id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
                  <span className="font-medium">{p.name}</span>
                  {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
                  <span className="text-xs text-muted-foreground">
                    {p.mobilize_date} → {p.demob_date ?? "—"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {p.room_label ?? "—"}{p.bed_no ? ` · ${p.bed_no}` : ""}
                    {p.lifeboat ? ` · ${p.lifeboat}` : ""}
                  </span>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Demob ${p.name} now (before the crew change)?`))
                        run(() => offboardTrip(p.trip_id));
                    }}
                    className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-destructive/10 hover:text-destructive"
                  >
                    Demob
                  </button>
                </div>
              ))}
              {onboard.length === 0 && <p className="py-1 text-xs text-muted-foreground">Nobody on board.</p>}

              <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Not on board ({ashore.length})
              </p>
              {ashore.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
                  <span className="font-medium">{m.full_name || m.email}</span>
                  {m.company && <span className="text-xs text-muted-foreground">{m.company}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    ashore{m.lifeboat ? ` · ${m.lifeboat}` : ""}
                  </span>
                  <button
                    disabled={pending}
                    onClick={() => run(() => boardMember(m.profile_id))}
                    className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-green-50 hover:text-green-700"
                  >
                    Board now
                  </button>
                </div>
              ))}
              {ashore.length === 0 && <p className="py-1 text-xs text-muted-foreground">Whole crew is on board.</p>}
            </DrillCard>
          );
        })()}

        {/* Drill-down: muster station manifest */}
        {drill?.type === "lb" && (
          <DrillCard
            title={`Muster ${drill.key} — manifest (${pob.people.filter((p) => (p.lifeboat || "Unassigned") === drill.key).length})`}
            onClose={() => setDrill(null)}
          >
            {pob.people
              .filter((p) => (p.lifeboat || "Unassigned") === drill.key)
              .sort((a, b) => (a.room_label ?? "").localeCompare(b.room_label ?? "") || a.name.localeCompare(b.name))
              .map((p) => (
                <div key={p.trip_id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
                  <span className="font-medium">{p.name}</span>
                  {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {p.room_label ?? "—"}{p.bed_no ? ` · ${p.bed_no}` : ""}
                    {p.crew_name ? ` · ${p.crew_name}` : ""}
                  </span>
                </div>
              ))}
          </DrillCard>
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
          <Stat label="Available" value={accommodation.availableBeds} tone="green" />
          <Stat label="Fixed (staff)" value={accommodation.fixedBeds} />
          <Stat label="Blocked rooms" value={accommodation.blockedRooms} />
        </div>
        {accommodation.overbooked.length > 0 && (
          <button
            onClick={() => toggle({ type: "rooms" })}
            className={cn(
              "mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100",
              isOpen({ type: "rooms" }) && "ring-1 ring-amber-500",
            )}
          >
            {accommodation.overbooked.length} room(s) hot-bunked — occupancy exceeds installed beds. View &amp; fix →
          </button>
        )}
        {drill?.type === "rooms" && (
          <DrillCard title="Hot-bunked rooms — reassign occupants to clear" onClose={() => setDrill(null)}>
            {accommodation.overbooked.map((r) => (
              <div key={r.room_id} className="border-b py-2 last:border-0">
                <p className="text-sm font-medium">
                  {r.label}{" "}
                  <span className="text-xs font-normal text-destructive">
                    {r.occupants.length} occupants / {r.beds} beds
                  </span>
                </p>
                <div className="mt-1 space-y-1">
                  {r.occupants.map((o) => (
                    <div key={o.trip_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span>{o.name}</span>
                      {o.bed_no && <span className="text-xs text-muted-foreground">{o.bed_no}</span>}
                      <LazySelect
                        value={r.room_id}
                        options={rooms}
                        getOptionValue={(rm) => rm.id}
                        getOptionLabel={(rm) => [rm.block, rm.room_number].filter(Boolean).join(" ")}
                        placeholder="— none —"
                        disabled={pending}
                        className={cn(field, "ml-auto py-1 text-xs")}
                        onChange={(v) => run(() => reassignTripRoom(o.trip_id, v))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </DrillCard>
        )}
      </section>

      {pob.overstayers.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm">
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
  const [pending, startTransition] = useStatusTransition("Saving…");
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

/** Editable crew name with an explicit Save button (preserves rotation/cycle). */
function CrewNameEditor({
  c,
  pending,
  run,
}: {
  c: Crew;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState(c.name);
  const changed = name.trim().length > 0 && name.trim() !== c.name;
  const save = () => {
    if (!changed) return;
    run(() =>
      upsertCrew({
        id: c.id,
        name: name.trim(),
        installationId: c.installation_id ?? undefined,
        rotationPattern: c.rotation_pattern ?? undefined,
        offshoreDays: c.offshore_days,
        onshoreDays: c.onshore_days,
        transportMode: c.transport_mode ?? undefined,
        departureLocation: c.departure_location ?? undefined,
        cycleStartDate: c.cycle_start_date ?? null,
      }),
    );
  };
  return (
    <div className="flex flex-1 items-center gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        disabled={pending}
        className={cn(field, "flex-1 font-medium")}
      />
      <Button size="sm" variant="outline" disabled={pending || !changed} onClick={save}>
        Save
      </Button>
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
            <div className="flex items-center justify-between gap-2">
              <CrewNameEditor c={c} pending={pending} run={run} />
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
                  Inbound manifest (board)
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
                  Outbound manifest (demob)
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

function RotationCalendarPanel({ calendar, crews }: { calendar: RotationCalendar; crews: Crew[] }) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const [repFrom, setRepFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [repWeeks, setRepWeeks] = useState(8);
  // Label every 7th day to keep the header readable.
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Weeks
          <input type="number" min={1} max={26} value={repWeeks} onChange={(e) => setRepWeeks(Number(e.target.value) || 8)} className={cn(field, "mt-0.5 block w-20 py-1")} />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!repFrom}
          onClick={() => window.open(`/offshore-rotation?from=${repFrom}&weeks=${repWeeks}`, "_blank")}
        >
          <FileText className="h-4 w-4" /> Open report (A3)
        </Button>
      </div>

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

      <CrewBackToBackList calendar={calendar} crews={crews} />
    </div>
  );
}

/** Crew-level back-to-back (the crew offshore while this one is ashore) + members. */
function CrewBackToBackList({ calendar, crews }: { calendar: RotationCalendar; crews: Crew[] }) {
  const EPOCH = new Date("2026-01-01T00:00:00Z").getTime();
  const DAY = 86_400_000;
  const phaseOf = (c: Crew) => {
    if (!c.cycle_start_date) return null;
    const cycle = c.offshore_days + c.onshore_days;
    if (cycle <= 0) return null;
    const d = Math.floor((new Date(c.cycle_start_date + "T00:00:00Z").getTime() - EPOCH) / DAY);
    return (((d % cycle) + cycle) % cycle);
  };
  const active = crews.filter((c) => c.is_active && c.cycle_start_date);
  // back-to-back = same pattern, phase offset by offshore_days (relieves this crew)
  const b2bOf = (c: Crew): Crew | null => {
    const cycle = c.offshore_days + c.onshore_days;
    const p = phaseOf(c);
    if (p === null) return null;
    const want = (p + c.offshore_days) % cycle;
    return (
      active.find(
        (o) =>
          o.id !== c.id &&
          o.offshore_days === c.offshore_days &&
          o.onshore_days === c.onshore_days &&
          phaseOf(o) === want,
      ) ?? null
    );
  };
  const membersByCrew = new Map(calendar.crews.map((c) => [c.id, c.members]));
  const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Crews · back-to-back &amp; members</h4>
      <div className="grid gap-2 lg:grid-cols-2">
        {sorted.map((c) => {
          const b2b = b2bOf(c);
          const members = membersByCrew.get(c.id) ?? [];
          return (
            <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.offshore_days}/{c.onshore_days} · {members.length} member(s)
                </span>
              </div>
              <p className="mt-0.5 text-xs">
                Back-to-back:{" "}
                <span className={cn("font-medium", b2b ? "text-foreground" : "text-muted-foreground")}>
                  {b2b ? b2b.name : "— none on opposite phase —"}
                </span>
              </p>
              {members.length > 0 && (
                <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {members.map((m, i) => (
                    <li key={i}>
                      <span className="mr-1 tabular-nums text-muted-foreground/70">{i + 1}.</span>
                      {m}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No crews with a cycle start to pair.</p>
        )}
      </div>
    </div>
  );
}

/** Live occupancy: every room with its checked-in occupants and a fill level. */
function RoomOccupancyList({ rooms, roster }: { rooms: Room[]; roster: RosterEntry[] }) {
  const [open, setOpen] = useState(true);
  const { pending, error, run } = useRun();
  const occupiedRooms = rooms.filter((r) => r.occupied > 0).length;
  const totalOnboard = rooms.reduce((n, r) => n + r.occupied, 0);
  const mates = roster
    .map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Show occupied rooms first, then by room label.
  const sorted = [...rooms].sort(
    (a, b) =>
      b.occupied - a.occupied ||
      [a.block, a.room_number].filter(Boolean).join(" ").localeCompare([b.block, b.room_number].filter(Boolean).join(" ")),
  );

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <span className="text-sm font-semibold">
          Room occupancy (live) — {occupiedRooms} room(s) in use · {totalOnboard} on board
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
          <div className="mb-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (confirm("Set default owners for every room from the current allocation? Each on-board rotator's fixed room/bed is set, and their back-to-back shares it."))
                  run(() => setAllRoomDefaults());
              }}
            >
              Set all default owners from current
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((r) => {
              const label = [r.block, r.room_number].filter(Boolean).join(" ");
              const beds = r.bed_count || 0;
              const over = r.occupied > beds;
              const pct = beds > 0 ? Math.min(100, (r.occupied / beds) * 100) : r.occupied > 0 ? 100 : 0;
              return (
                <div key={r.id} className={cn("rounded-md border p-2 text-sm", r.occupied === 0 && "opacity-60")}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{label}</span>
                    <span className={cn("text-xs font-semibold", over ? "text-destructive" : r.occupied === 0 ? "text-muted-foreground" : "text-green-700")}>
                      {r.occupied}/{beds}
                      {over ? " · hot-bunk" : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full", over ? "bg-destructive" : "bg-green-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {r.occupants.length > 0 && (
                    <ul className="mt-1.5 space-y-1.5">
                      {r.occupants.map((o) => (
                        <li key={o.trip_id} className="border-b pb-1.5 last:border-0 last:pb-0">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-mono text-muted-foreground">{o.bed_no || "•"}</span>
                            <span className="font-medium">{o.name}</span>
                            <button
                              disabled={pending}
                              title="Remove from board"
                              onClick={() => {
                                if (confirm(`Remove ${o.name} from board? They'll be taken off POB.`))
                                  run(() => offboardTrip(o.trip_id));
                              }}
                              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {o.profile_id && (
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <span>B2B:</span>
                              <select
                                value={mates.find((m) => m.name === o.b2b_name)?.id ?? ""}
                                disabled={pending}
                                onChange={(e) => run(() => setBackToBack(o.profile_id as string, e.target.value || null))}
                                className="flex-1 rounded border bg-background px-1 py-0.5 text-[11px]"
                              >
                                <option value="">— none —</option>
                                {mates
                                  .filter((m) => m.id !== o.profile_id)
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-1.5 border-t pt-1 text-[11px] text-muted-foreground">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium">Default owner(s)</span>
                      {r.occupied > 0 && (
                        <button
                          disabled={pending}
                          title="Set the current occupants (and their back-to-backs) as this room's fixed owners"
                          onClick={() => run(() => setRoomDefaultOwners(r.id))}
                          className="rounded border px-1.5 py-0.5 hover:bg-accent"
                        >
                          Set from current
                        </button>
                      )}
                    </div>
                    {r.owners.length > 0 ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {r.owners.map((o, i) => (
                          <li key={i}>
                            <span className="font-mono">{o.bed || "•"}</span> {o.name}
                            {o.back_to_back ? <span className="text-muted-foreground/70"> ⇄ {o.back_to_back}</span> : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 italic">none set</p>
                    )}
                  </div>
                </div>
              );
            })}
            {rooms.length === 0 && <p className="text-sm text-muted-foreground">No rooms yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function RoomsPanel({
  rooms,
  installations,
  roster,
}: {
  rooms: Room[];
  installations: Installation[];
  roster: RosterEntry[];
}) {
  const { pending, error, run } = useRun();
  const [installationId, setInstallationId] = useState("");
  const [block, setBlock] = useState("");
  const [floor, setFloor] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [beds, setBeds] = useState("2");
  const [gender, setGender] = useState<GenderRestriction>("any");
  const [repDate, setRepDate] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          As of
          <input type="date" value={repDate} onChange={(e) => setRepDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <Button size="sm" variant="outline" disabled={!repDate} onClick={() => window.open(`/offshore-rooms?date=${repDate}`, "_blank")}>
          <FileText className="h-4 w-4" /> Room allocation report
        </Button>
      </div>
      <RoomOccupancyList rooms={rooms} roster={roster} />
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
              <th className="px-3 py-2 font-medium">Muster</th>
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
                    <input
                      defaultValue={r.lifeboat ?? ""}
                      disabled={pending}
                      placeholder="LB-1"
                      onBlur={(e) => {
                        if (e.target.value !== (r.lifeboat ?? "")) run(() => updateRoomFields({ id: r.id, lifeboat: e.target.value }));
                      }}
                      className={`${cell} w-20`}
                    />
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
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No rooms yet.</td></tr>
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
  const [repDate, setRepDate] = useState(() => new Date().toISOString().slice(0, 10));

  function expired(date: string | null) {
    return date ? new Date(date) < new Date() : false;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          As of
          <input type="date" value={repDate} onChange={(e) => setRepDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <Button size="sm" variant="outline" disabled={!repDate} onClick={() => window.open(`/offshore-roster?date=${repDate}`, "_blank")}>
          <FileText className="h-4 w-4" /> Roster &amp; room allocation report
        </Button>
      </div>

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
              <LazySelect
                value={m.back_to_back_id ?? null}
                options={roster.filter((o) => o.profile_id !== m.profile_id)}
                getOptionValue={(o) => o.profile_id}
                getOptionLabel={(o) => o.full_name || o.email || ""}
                placeholder="Back-to-back…"
                disabled={pending}
                className={field}
                onChange={(v) => run(() => updateRosterMember({ id: m.id, backToBackId: v }))}
              />
              <LazySelect
                value={m.fixed_room_id ?? null}
                options={rooms}
                getOptionValue={(r) => r.id}
                getOptionLabel={(r) => [r.block, r.room_number].filter(Boolean).join(" ")}
                placeholder="Fixed room…"
                disabled={pending}
                className={field}
                onChange={(v) => run(() => updateRosterMember({ id: m.id, fixedRoomId: v }))}
              />
              <input
                defaultValue={m.fixed_bed ?? ""}
                disabled={pending}
                placeholder="Fixed bed (Bed 1)"
                onBlur={(e) => {
                  if (e.target.value !== (m.fixed_bed ?? "")) run(() => updateRosterMember({ id: m.id, fixedBed: e.target.value }));
                }}
                className={field}
              />
              <div className={cn(field, "flex items-center gap-1 bg-muted/40")} title="Muster follows the fixed room">
                <span className="text-xs text-muted-foreground">Muster:</span>
                <span className="font-medium">{m.lifeboat ?? "— set on room —"}</span>
              </div>
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
