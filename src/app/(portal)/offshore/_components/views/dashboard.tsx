"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BedDouble, RefreshCw, Siren, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { countAwaitingBed, visitorsAwaitingBed } from "@/lib/offshore/visitor-queue";
import {
  EXCEPTION_STATES,
  IDENTITY_LABEL,
  SCHEDULE_STATE_LABEL,
} from "@/lib/offshore/pob-classify";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import {
  ROOM_STATUS_LABEL,
  type AccommodationSummary,
  type CertAlert,
  type Crew,
  type OffshoreTrip,
  type PobBreakdown,
  type PobOnboard,
  type Room,
  type RosterEntry,
  type VisitRequest,
} from "@/types/offshore";
import {
  assignToCrew,
  autoAssignBySchedule,
  boardMember,
  startMusterDrill,
  offboardTrip,
  reassignTripRoom,
  setTripCategory,
  setVisitorMovement,
} from "../../actions";
import { PendingApprovals } from "../pending-approvals";
import { field, useRun } from "./shared";

/**
 * POB overview: headline counts, drill-downs, unassigned rotators and the
 * Campboss's booking queue.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

/**
 * Approved visitors still without a bed — the Campboss's booking queue.
 *
 * Approval and accommodation belong to different people: the OIM decides
 * whether a visit happens, the Campboss finds the room. Nothing joined the two,
 * so an approved visitor needing a bed showed up only as one card among all
 * visitors, with no count and no prompt. Grouped by installation because a
 * Campboss runs one platform.
 */
function VisitorBookingQueue({
  visits,
  canDemob = false,
}: {
  visits: VisitRequest[];
  /** Demobilising is an `operate` act — managers and the Dispatcher. */
  canDemob?: boolean;
}) {
  const { pending, error, run } = useRun();
  const groups = useMemo(
    () =>
      visitorsAwaitingBed(
        visits.map((v) => ({
          id: v.id,
          visitor_name: v.visitor_name,
          visitor_company: v.visitor_company,
          status: v.status,
          depart_date: v.depart_date,
          return_date: v.return_date,
          accommodation_required: v.accommodation_required,
          installation_id: v.installation_id,
          installation_name: v.installation_name,
          allocation: v.allocation,
        })),
      ),
    [visits],
  );
  const total = countAwaitingBed(groups);
  if (total === 0) return null;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 px-3 py-2">
        <BedDouble className="h-4 w-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">Visitors awaiting a bed</h3>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
          {total}
        </span>
        <Link
          href="/offshore?view=visitors"
          className="ml-auto rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
        >
          Book rooms
        </Link>
      </div>
      {error && (
        <p className="mx-3 mt-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-2 p-3">
        {groups.map((g) => (
          <div key={g.installation_id ?? "none"}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
              {g.installation_name} ({g.visits.length})
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {g.visits.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-2 text-xs text-amber-900">
                  <span className="font-medium">{v.visitor_name}</span>
                  {v.visitor_company && <span className="opacity-70">{v.visitor_company}</span>}
                  <span className="opacity-70">
                    {v.depart_date}
                    {v.return_date ? ` → ${v.return_date}` : ""}
                  </span>
                  {v.status === "onboard" && (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      already on board
                    </span>
                  )}
                  {canDemob && (
                    <button
                      type="button"
                      disabled={pending}
                      title={`Demob ${v.visitor_name} — use when they are on this list by mistake`}
                      onClick={() => {
                        if (
                          confirm(
                            `Demob ${v.visitor_name}?\n\nThey leave this queue, stop counting on POB and drop off the meal sheet. Use this when they are here by mistake or did not travel.`,
                          )
                        ) {
                          run(() => setVisitorMovement(v.id, "returned"));
                        }
                      }}
                      className="ml-auto rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium hover:bg-destructive/10 hover:text-destructive"
                    >
                      Demob
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "green";
  /** When set, the card becomes a button that opens its detail drill-down. */
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className={cn("text-2xl font-semibold", tone === "green" && "text-green-700")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </>
  );
  const base = cn(
    "rounded-lg border bg-card p-3 text-left",
    tone === "green" && "border-green-300 bg-green-50",
  );
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show details"
      className={cn(base, "transition-colors hover:border-primary/50 hover:bg-accent", active && "ring-1 ring-primary")}
    >
      {body}
    </button>
  );
}

function DrillCard({
  title,
  onClose,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  onClose: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
          )}
          <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">{children}</div>
    </div>
  );
}

/** Compact rows for a list of on-board people in a stat drill-down. */
function PobPeopleRows({
  people,
  canDemob = false,
}: {
  people: PobOnboard[];
  /** Demobilising is an `operate` act — managers and the Dispatcher. */
  canDemob?: boolean;
}) {
  const { pending, error, run } = useRun();
  if (people.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <>
      {error && (
        <p className="my-1 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</p>
      )}
      {[...people]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => {
          // A visitor booking carries no trip; its row id is "visit-<id>".
          const visitId = p.trip_id.startsWith("visit-") ? p.trip_id.slice(6) : null;
          return (
          <div key={p.trip_id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
            <span className="font-medium">{p.name}</span>
            {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              {IDENTITY_LABEL[p.identity]}
            </span>
            {p.schedule_state !== "on_schedule" && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[10px]",
                  p.schedule_state === "overstaying"
                    ? "bg-destructive/10 text-destructive"
                    : p.schedule_state === "unscheduled"
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-100 text-amber-800",
                )}
              >
                {SCHEDULE_STATE_LABEL[p.schedule_state]}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {p.crew_name ?? "—"} · {p.room_label ?? "no bed"}{p.bed_no ? ` · ${p.bed_no}` : ""}{p.lifeboat ? ` · ${p.lifeboat}` : ""}
            </span>
            {canDemob && (
              <button
                type="button"
                disabled={pending}
                title={`Demob ${p.name} — they leave POB, the muster roll and the meal sheet`}
                onClick={() => {
                  if (
                    !confirm(
                      `Demob ${p.name}?\n\nThey come off POB, the muster roll and the meal sheet. Use this when they have gone ashore, or are on this list by mistake.`,
                    )
                  )
                    return;
                  run(() =>
                    visitId ? setVisitorMovement(visitId, "returned") : offboardTrip(p.trip_id),
                  );
                }}
                className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-destructive/10 hover:text-destructive"
              >
                Demob
              </button>
            )}
          </div>
          );
        })}
    </>
  );
}

/** Compact rows for a list of rooms in a stat drill-down. */
function RoomRows({ rooms, showFree }: { rooms: Room[]; showFree?: boolean }) {
  if (rooms.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  const labelOf = (r: Room) => [r.block, r.room_number].filter(Boolean).join(" ") || "—";
  return (
    <>
      {[...rooms]
        .sort((a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { numeric: true }))
        .map((r) => {
          const free = Math.max(0, (r.bed_count || 0) - r.occupied);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="font-medium">{labelOf(r)}</span>
              <span className="text-xs text-muted-foreground">{r.installation_name ?? "—"}</span>
              {r.status !== "available" && (
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{ROOM_STATUS_LABEL[r.status]}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {showFree ? `${free} free · ` : ""}{r.occupied}/{r.bed_count || 0}
              </span>
            </div>
          );
        })}
    </>
  );
}

/** Rows for roster members with a fixed cabin. */
function FixedCabinRows({ roster }: { roster: RosterEntry[] }) {
  const fixed = roster.filter((m) => m.fixed_room_id);
  if (fixed.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <>
      {[...fixed]
        .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email))
        .map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
            <span className="font-medium">{m.full_name || m.email}</span>
            {m.crew_name && <span className="text-xs text-muted-foreground">{m.crew_name}</span>}
            <span className="ml-auto text-xs text-muted-foreground">
              {m.fixed_room_label ?? "—"}{m.fixed_bed ? ` · ${m.fixed_bed}` : ""}
            </span>
          </div>
        ))}
    </>
  );
}

/** Rows for the overstayer list (past planned return). */
function OverstayerRows({ list }: { list: PobBreakdown["overstayers"] }) {
  if (list.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <>
      {list.map((o, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
          <span className="font-medium">{o.name}</span>
          <span className="text-xs text-muted-foreground">{o.installation ?? "—"}</span>
          <span className="ml-auto text-xs text-amber-700">
            {o.demob_date ? `due ${o.demob_date}` : "no return date set"}
          </span>
        </div>
      ))}
    </>
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

type Drill =
  | { type: "crew" | "lb" | "stat"; key: string }
  | { type: "rooms" }
  | null;

export function Dashboard({
  canDecide,
  pob,
  accommodation,
  certAlerts,
  crews,
  rooms,
  roster,
  visits,
  trips,
}: {
  /** False for viewers who see the queue but cannot decide it. */
  canDecide: boolean;
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
  certAlerts: CertAlert[];
  crews: Crew[];
  rooms: Room[];
  roster: RosterEntry[];
  visits: VisitRequest[];
  trips: OffshoreTrip[];
}) {
  const { pending, error, run } = useRun();
  const [drill, setDrill] = useState<Drill>(null);

  const isOpen = (d: NonNullable<Drill>) =>
    drill?.type === d.type && ("key" in d ? "key" in drill && drill.key === d.key : true);
  const toggle = (d: NonNullable<Drill>) => setDrill((cur) => (isOpen(d) ? null : d));

  const unassigned = pob.people.filter((p) => !p.crew_id);

  // Clickable KPI cards → a detail drill-down that can be refreshed live.
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refresh = () => startRefresh(() => router.refresh());
  const today = new Date().toISOString().slice(0, 10);
  const statDrill = (key: string) => ({
    onClick: () => toggle({ type: "stat", key }),
    active: isOpen({ type: "stat", key }),
  });
  const POB_STAT_KEYS = [
    "pob",
    "rotational",
    "non_rotational",
    "visitors",
    "arrivals",
    "departures",
    "overstayers",
    ...EXCEPTION_STATES.map((s) => `sched:${s}`),
  ];
  const blocked = (r: Room) => ["blocked", "maintenance"].includes(r.status);
  function statCard(key: string): { title: string; node: ReactNode } | null {
    // Schedule-state chips drill into the same people list, filtered by state.
    if (key.startsWith("sched:")) {
      const state = key.slice(6) as PobOnboard["schedule_state"];
      const list = pob.people.filter((p) => p.schedule_state === state);
      return {
        title: `${SCHEDULE_STATE_LABEL[state]} (${list.length})`,
        node: <PobPeopleRows people={list} canDemob={canDecide} />,
      };
    }
    const byIdentity = (id: PobOnboard["identity"]) => pob.people.filter((p) => p.identity === id);
    switch (key) {
      case "pob":
        return { title: `On board now (${pob.total})`, node: <PobPeopleRows people={pob.people} canDemob={canDecide} /> };
      case "rotational":
        return { title: `Rotational staff on board (${pob.byIdentity.rotational})`, node: <PobPeopleRows people={byIdentity("rotational")} canDemob={canDecide} /> };
      case "non_rotational":
        return { title: `Non-rotational staff on board (${pob.byIdentity.non_rotational})`, node: <PobPeopleRows people={byIdentity("non_rotational")} canDemob={canDecide} /> };
      case "visitors":
        return { title: `Visitors on board (${pob.byIdentity.visitor})`, node: <PobPeopleRows people={byIdentity("visitor")} canDemob={canDecide} /> };
      case "arrivals":
        return { title: `Arrived today (${pob.arrivalsToday})`, node: <PobPeopleRows people={pob.people.filter((p) => p.mobilize_date === today)} canDemob={canDecide} /> };
      case "departures":
        return { title: `Departing today (${pob.departuresToday})`, node: <PobPeopleRows people={pob.people.filter((p) => p.demob_date === today)} canDemob={canDecide} /> };
      case "overstayers":
        return { title: `Overstayers (${pob.overstayers.length})`, node: <OverstayerRows list={pob.overstayers} /> };
      case "rooms":
        return { title: `Rooms (${accommodation.totalRooms})`, node: <RoomRows rooms={rooms} /> };
      case "beds":
        return { title: `Usable beds (${accommodation.totalBeds})`, node: <RoomRows rooms={rooms.filter((r) => !blocked(r))} /> };
      case "occupied":
        return { title: `Occupied — who's in a bed (${accommodation.occupiedBeds})`, node: <PobPeopleRows people={pob.people.filter((p) => p.room_id)} canDemob={canDecide} /> };
      case "available":
        return { title: `Rooms with a free bed (${accommodation.availableBeds} beds)`, node: <RoomRows rooms={rooms.filter((r) => !blocked(r) && Math.max(0, (r.bed_count || 0) - r.occupied) > 0)} showFree /> };
      case "fixed":
        return { title: `Fixed cabins — staff (${accommodation.fixedBeds})`, node: <FixedCabinRows roster={roster} /> };
      case "blocked":
        return { title: `Blocked / maintenance rooms (${accommodation.blockedRooms})`, node: <RoomRows rooms={rooms.filter(blocked)} /> };
      default:
        return null;
    }
  }
  const statDetail = drill?.type === "stat" ? statCard(drill.key) : null;
  const statDrillCard = (group: "pob" | "acc") =>
    drill?.type === "stat" &&
    statDetail &&
    POB_STAT_KEYS.includes(drill.key) === (group === "pob") ? (
      <DrillCard title={statDetail.title} onClose={() => setDrill(null)} onRefresh={refresh} refreshing={refreshing}>
        {statDetail.node}
      </DrillCard>
    ) : null;

  return (
    <div className="space-y-5">
      <PendingApprovals visits={visits} trips={trips} canDecide={canDecide} />
      <VisitorBookingQueue visits={visits} canDemob={canDecide} />
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
        {/* Two independent axes. These cards answer "what is this person"; the
            strip below answers "are they where the schedule expects them". */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Current POB" value={pob.total} {...statDrill("pob")} />
          <Stat label="Rotational staff" value={pob.byIdentity.rotational} {...statDrill("rotational")} />
          <Stat label="Non-rotational staff" value={pob.byIdentity.non_rotational} {...statDrill("non_rotational")} />
          <Stat label="Visitors" value={pob.byIdentity.visitor} {...statDrill("visitors")} />
          <Stat label="Arrivals today" value={pob.arrivalsToday} {...statDrill("arrivals")} />
          <Stat label="Departures today" value={pob.departuresToday} {...statDrill("departures")} />
          <Stat label="Overstayers" value={pob.overstayers.length} {...statDrill("overstayers")} />
        </div>
        {EXCEPTION_STATES.some((s) => pob.byScheduleState[s] > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">Against schedule:</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              On schedule · {pob.byScheduleState.on_schedule}
            </span>
            {EXCEPTION_STATES.filter((s) => pob.byScheduleState[s] > 0).map((s) => (
              <button
                key={s}
                onClick={() => toggle({ type: "stat", key: `sched:${s}` })}
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  s === "overstaying"
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : s === "unscheduled"
                      ? "bg-muted text-muted-foreground hover:bg-accent"
                      : "bg-amber-100 text-amber-800 hover:bg-amber-200",
                  isOpen({ type: "stat", key: `sched:${s}` }) && "ring-1 ring-primary",
                )}
              >
                {SCHEDULE_STATE_LABEL[s]} · {pob.byScheduleState[s]}
              </button>
            ))}
          </div>
        )}
        {statDrillCard("pob")}
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
          <Stat label="Rooms" value={accommodation.totalRooms} {...statDrill("rooms")} />
          <Stat label="Beds (usable)" value={accommodation.totalBeds} {...statDrill("beds")} />
          <Stat label="Occupied" value={accommodation.occupiedBeds} {...statDrill("occupied")} />
          <Stat label="Available" value={accommodation.availableBeds} tone="green" {...statDrill("available")} />
          <Stat label="Fixed (staff)" value={accommodation.fixedBeds} {...statDrill("fixed")} />
          <Stat label="Blocked rooms" value={accommodation.blockedRooms} {...statDrill("blocked")} />
        </div>
        {statDrillCard("acc")}
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
