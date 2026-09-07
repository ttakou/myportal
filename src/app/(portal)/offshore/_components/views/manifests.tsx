"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, History, ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { planManifest, seatOverflow } from "@/lib/offshore/manifest-plan";
import {
  crewFill,
  manifestCandidates,
  pendingMovements,
  planPicksAsCandidates,
  type ManifestCandidate,
} from "@/lib/offshore/manifest-picker";
import { offshorePeople } from "@/lib/offshore/people";
import { manifestDescriptor } from "@/lib/offshore/manifest-label";
import { Button } from "@/components/ui/button";
import {
  MANIFEST_STATUS_LABEL,
  type AssignableEmployee,
  type Crew,
  type Manifest,
  type ManifestStatus,
  type PobBreakdown,
  type RosterEntry,
  type VisitRequest,
} from "@/types/offshore";
import {
  confirmManifestMovement,
  createManifest,
  removeManifestPax,
  reverseManifestPax,
  setManifestStatus,
  togglePaxNoShow,
  updateManifestTransport,
} from "../../actions";
import { field, rosterInfo, useRun } from "./shared";

/**
 * Manifests: build, confirm and archive crew-change and ad-hoc movements.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

const MANIFEST_STYLE: Record<ManifestStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-accent text-accent-foreground",
  locked: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

/** Build a manifest: pick mode + date, then move passengers from left to right. */

function ManifestBuilder({
  crews,
  roster,
  employees,
  onboard,
  visits,
  pending,
  run,
}: {
  crews: Crew[];
  roster: RosterEntry[];
  /** Every active profile — going offshore is not limited to the roster. */
  employees: AssignableEmployee[];
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
  const [picked, setPicked] = useState<ManifestCandidate[]>([]);

  const pickedKeys = new Set(picked.map((p) => p.key));

  const aboardIds = useMemo(
    () => new Set(onboard.map((o) => o.profile_id).filter(Boolean) as string[]),
    [onboard],
  );

  // Everyone who may travel — the directory, enriched by the roster. Anyone
  // barred by travel_eligible is excluded; a missing roster row is not a bar.
  const people = useMemo(() => offshorePeople(employees, rosterInfo(roster)), [employees, roster]);

  // Everyone is selectable in either direction — real crew changes carry late
  // additions and people already in place. The direction only decides whether a
  // pick also changes their status, which is confirmed before it happens.
  const allCandidates = useMemo(
    () =>
      manifestCandidates({
        direction,
        roster: people,
        onboard: onboard.map((o) => ({ profile_id: o.profile_id, crew_id: o.crew_id })),
        visits: visits.map((v) => ({ id: v.id, visitor_name: v.visitor_name, status: v.status })),
      }),
    [direction, people, onboard, visits],
  );

  const candidates = allCandidates
    .filter((c) => !crewId || c.crew_id === crewId)
    .filter((c) => !pickedKeys.has(c.key))
    .filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));

  // What creating this manifest would do to the people on it.
  const movements = pendingMovements(picked, direction);
  const movementCount = movements.board.length + movements.offboard.length;

  // Everyone the schedule says should travel on this date and direction: the
  // rotation cycle decides the crews, the bookings decide the visitors. See
  // lib/offshore/manifest-plan.ts — the rules are unit-tested there.
  const plan = useMemo(
    () =>
      planManifest({
        direction,
        dateIso: date,
        crewIdFilter: crewId || null,
        crews: crews.map((c) => ({
          id: c.id,
          name: c.name,
          offshore_days: c.offshore_days,
          onshore_days: c.onshore_days,
          cycle_start_date: c.cycle_start_date,
        })),
        roster: roster.map((m) => ({
          profile_id: m.profile_id,
          name: m.full_name || m.email,
          crew_id: m.crew_id,
          is_rotational: m.is_rotational,
        })),
        onboard: onboard.map((o) => ({
          profile_id: o.profile_id,
          name: o.name,
          crew_id: o.crew_id,
        })),
        visits: visits.map((v) => ({
          id: v.id,
          visitor_name: v.visitor_name,
          status: v.status,
          depart_date: v.depart_date,
          return_date: v.return_date,
        })),
      }),
    [direction, date, crewId, crews, roster, onboard, visits],
  );

  // Pre-fill whenever the planning inputs change. Everyone the schedule returns
  // goes on — an overbooked run is flagged below rather than trimmed, so the
  // operator decides who moves. They can still add or remove anyone by hand.
  const planKey = `${direction}|${date}|${crewId}|${plan.picks.map((p) => p.kind + p.id).join(",")}`;
  const appliedKey = useRef<string | null>(null);
  useEffect(() => {
    if (appliedKey.current === planKey) return;
    appliedKey.current = planKey;
    setPicked(planPicksAsCandidates(plan.picks, allCandidates, direction, aboardIds));
  }, [planKey, plan.picks, allCandidates, direction, aboardIds]);

  const reasonFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plan.picks) m.set((p.kind === "staff" ? "s" : "v") + p.id, p.reason);
    return m;
  }, [plan.picks]);

  const setModeAndSeats = (m: "helicopter" | "boat") => {
    setMode(m);
    setSeats(m === "boat" ? 24 : 12);
  };
  const reset = () => {
    setPicked([]);
    setDate("");
    setSearch("");
  };
  function submit() {
    // Creating the manifest can also move people. Say exactly who, and let the
    // operator create it without the movements if that is not what they meant.
    let applyMovements = false;
    if (movementCount > 0) {
      const what = movements.board.length
        ? `mobilise ${movements.board.length} person(s) who are ashore`
        : `demobilise ${movements.offboard.length} person(s) who are on board`;
      applyMovements = confirm(
        `This manifest will also ${what}, changing POB, the muster roll and catering counts.\n\n` +
          `${[...movements.board, ...movements.offboard].map((p) => `• ${p.name}`).join("\n")}\n\n` +
          `OK to create and apply. Cancel to create the manifest only.`,
      );
    }
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
          applyMovements,
        }),
      reset,
    );
  }

  const seatCheck = seatOverflow(picked.length, seats);
  const over = seatCheck.over;

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-card/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in")} className={cn(field, "mt-0.5 block py-1")}>
            <option value="out">Going offshore — joining (mobilise)</option>
            <option value="in">Coming ashore — leaving (demobilise)</option>
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
        <Button
          size="sm"
          variant="outline"
          disabled={pending || plan.picks.length === 0}
          title={
            plan.picks.length
              ? "Put back everyone the rotation schedule says is due on this date"
              : "Nothing is scheduled for this date and direction"
          }
          onClick={() =>
            setPicked(planPicksAsCandidates(plan.picks, allCandidates, direction, aboardIds))
          }
        >
          Fill from schedule ({plan.picks.length})
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !crewId}
          title={
            crewId
              ? "Add every member of this crew on the right side of the change"
              : "Pick a crew first"
          }
          onClick={() => {
            const fill = crewFill(allCandidates, crewId, direction);
            setPicked((cur) => {
              const have = new Set(cur.map((p) => p.key));
              return [...cur, ...fill.filter((c) => !have.has(c.key))];
            });
          }}
        >
          Add entire crew
        </Button>
        <label className="text-xs text-muted-foreground">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Seats
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value) || 1)} className={cn(field, "mt-0.5 block w-20 py-1")} />
        </label>
      </div>

      {/* What the schedule produced for this date + direction. */}
      {!date ? (
        <p className="text-[11px] text-muted-foreground">
          Pick a date to pre-fill the manifest from the rotation schedule and the visitor bookings.
        </p>
      ) : plan.scheduledCrews.length > 0 && plan.picks.length === 0 ? (
        // The crew's cycle turns on this date but there is nobody to move: on a
        // leaving run none of them are aboard, on a joining run they all are.
        // Saying "pre-filled" over an empty list reads as a broken schedule.
        <p className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium">
            {plan.scheduledCrews.map((c) => c.name).join(", ")}
          </span>{" "}
          {direction === "out" ? "is due offshore" : "is due ashore"} on {date}, but nobody was added:{" "}
          {direction === "out"
            ? "every member is already on board."
            : "none of its members are on board."}{" "}
          Add anyone you need from the list below.
        </p>
      ) : plan.scheduledCrews.length > 0 || plan.picks.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Pre-filled from the schedule:{" "}
          {plan.scheduledCrews.length > 0 ? (
            <>
              <span className="font-medium">
                {plan.scheduledCrews.map((c) => c.name).join(", ")}
              </span>{" "}
              {direction === "out" ? "due offshore" : "due ashore"}
            </>
          ) : (
            "no crew change"
          )}
          {plan.picks.some((p) => p.kind === "visitor") &&
            `, plus ${plan.picks.filter((p) => p.kind === "visitor").length} booked visitor(s)`}
          . Everyone due is listed — add or remove anyone before creating, from either side of the
          change.
        </p>
      ) : (
        <p className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
          Nothing is scheduled to move on {date}
          {crewId ? " for this crew" : ""}.
          {plan.nearest.length > 0 && (
            <>
              {" "}
              Nearest{" "}
              {direction === "out" ? "departures" : "returns"}:{" "}
              {plan.nearest.map((n) => `${n.crewName} ${n.dateIso}`).join(" · ")}.
            </>
          )}{" "}
          You can still build the movement by hand.
        </p>
      )}

      {movementCount > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          Creating this manifest will also{" "}
          {movements.board.length > 0 && <strong>mobilise {movements.board.length}</strong>}
          {movements.offboard.length > 0 && <strong>demobilise {movements.offboard.length}</strong>}{" "}
          person(s) — POB, the muster roll and catering counts change with it. You will be asked to
          confirm, and can still create the manifest without moving anyone.
        </p>
      )}

      {/* Overbooking is surfaced, never silently trimmed. */}
      {over && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] font-medium text-destructive">
          Overbooked by {seatCheck.excess} — {picked.length} passenger(s) for {seats} seat(s). Everyone
          scheduled is still listed: add a run, raise the seat count, or take people off before creating.
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
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "mr-1 tabular-nums",
                        // Everyone past the seat count is still listed; number
                        // them in red so the overflow is obvious at a glance.
                        i >= seats ? "font-semibold text-destructive" : "text-muted-foreground/70",
                      )}
                    >
                      {i + 1}.
                    </span>
                    {p.name}
                    {reasonFor.has(p.key) && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        · {reasonFor.get(p.key)}
                      </span>
                    )}
                  </span>
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

export function ManifestsPanel({
  manifests,
  crews,
  roster,
  employees,
  onboard,
  visits,
}: {
  manifests: Manifest[];
  crews: Crew[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  onboard: PobBreakdown["people"];
  visits: VisitRequest[];
}) {
  const { pending, error, run } = useRun();

  const active = manifests.filter((m) => m.status !== "completed" && m.status !== "cancelled");
  const history = manifests.filter((m) => m.status === "completed" || m.status === "cancelled");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <ManifestBuilder
        crews={crews}
        roster={roster}
        employees={employees}
        onboard={onboard}
        visits={visits}
        pending={pending}
        run={run}
      />

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
      // Search what is shown — "mob", "demob", "helicopter", the route — not the
      // stored title, which the card no longer displays.
      return (
        manifestDescriptor(m).summary.toLowerCase().includes(q) ||
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

  // Derived from the manifest's own columns: the stored title was baked by more
  // than one code path and contradicts the data on some rows.
  const desc = manifestDescriptor(m);

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
        {m.crew_name && <span className="font-medium">{m.crew_name}</span>}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-semibold",
            desc.movement === "MOB"
              ? "bg-green-100 text-green-800"
              : "bg-blue-100 text-blue-800",
          )}
          title={desc.movementLong}
        >
          {desc.movement}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {desc.transport}
        </span>
        <span className="text-xs text-muted-foreground">{desc.route}</span>
        <span className="text-xs font-medium tabular-nums">{desc.date}</span>
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
