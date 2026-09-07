"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { bedCandidates } from "@/lib/offshore/bed-candidates";
import { offshorePeople } from "@/lib/offshore/people";
import { Button } from "@/components/ui/button";
import {
  GENDER_LABEL,
  ROOM_STATUS_LABEL,
  type AssignableEmployee,
  type PobOnboard,
  type Room,
  type RosterEntry,
} from "@/types/offshore";
import { reassignTripRoom, autoAllocateBeds } from "../../actions";
import { EmptyBed } from "./bed-cells";
import { field, rosterInfo, useRun } from "./shared";

/**
 * Bed board: every bed on one screen, for allocating at a glance.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

/**
 * Bed board — every usable room with at least one empty bed, with inline
 * assignment of an on-board person (one who has no bed yet) straight into a
 * free bed. Assigning sets that trip's room + bed, so the person leaves the
 * "waiting for a bed" pool on the next refresh.
 */
export function BedBoardPanel({
  rooms,
  onboard,
  roster,
  employees,
  readOnly = false,
}: {
  rooms: Room[];
  onboard: PobOnboard[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  readOnly?: boolean;
}) {
  const { pending, error, run } = useRun();
  const [q, setQ] = useState("");
  // Full rooms stay on the board by default — they still need editing (move
  // someone out, relabel a bed). Tick the filter to narrow to rooms with space.
  const [freeOnly, setFreeOnly] = useState(false);
  const [allocMsg, setAllocMsg] = useState<string | null>(null);

  function autoAllocate() {
    setAllocMsg(null);
    run(async () => {
      const res = await autoAllocateBeds();
      if (res.ok) {
        const placed = res.placed ?? 0;
        const unplaced = res.unplaced ?? 0;
        setAllocMsg(
          placed === 0 && unplaced === 0
            ? "Everyone on board already has a bed."
            : `Seated ${placed} ${placed === 1 ? "person" : "people"}` +
                (unplaced ? ` · ${unplaced} still need a manual bed (no free room open to anyone)` : "") +
                ".",
        );
      }
      return res;
    });
  }

  const labelOf = (r: Room) => [r.block, r.room_number].filter(Boolean).join(" ");

  // Everyone on board is a candidate: those with no bed (assign) and those in
  // another room (move). A person holds a single on-board trip, so pointing that
  // trip at a new room+bed is inherently "one room at a time" — the move clears
  // their previous room automatically.
  const pool = useMemo(
    () =>
      onboard.map((p) => ({
        id: p.trip_id,
        room_id: p.room_id,
        name: p.company ? `${p.name} · ${p.company}` : p.name,
        placedIn: p.room_id ? p.room_label : null,
        bed: p.bed_no,
      })),
    [onboard],
  );
  const waitingCount = pool.filter((p) => !p.room_id).length;

  // Roster members not on board; allocating a berth boards them (bedCandidates).
  const ashorePool = useMemo(() => {
    const aboard = new Set(onboard.map((p) => p.profile_id).filter(Boolean) as string[]);
    return offshorePeople(employees, rosterInfo(roster))
      .filter((m) => !aboard.has(m.profile_id))
      .map((m) => ({ profile_id: m.profile_id, name: m.name, crew_name: m.crew_name }));
  }, [employees, roster, onboard]);

  const usable = useMemo(
    () => rooms.filter((r) => !["blocked", "maintenance"].includes(r.status)),
    [rooms],
  );
  const totalFree = usable.reduce((n, r) => n + Math.max(0, (r.bed_count || 0) - r.occupied), 0);

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    return usable
      .filter((r) => {
        const free = (r.bed_count || 0) - r.occupied;
        if (freeOnly && free <= 0) return false;
        if (!needle) return true;
        const hay = [r.block, r.floor, r.room_number, r.lifeboat].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        // Rooms with a free bed first, then by label.
        const fa = (a.bed_count || 0) - a.occupied;
        const fb = (b.bed_count || 0) - b.occupied;
        return (fb > 0 ? 1 : 0) - (fa > 0 ? 1 : 0) || labelOf(a).localeCompare(labelOf(b));
      });
  }, [usable, needle, freeOnly]);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Every usable room, full ones included so you can always move someone out. Type a name into an
        empty bed to drop that person straight into it — their POB record gets that room &amp; bed.
        Anyone ashore is offered too — not just rostered crew — and picking one boards them into that
        bed. Blocked and under-maintenance rooms are hidden.
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
        <span className="font-semibold text-green-700">{totalFree}</span>
        <span className="text-muted-foreground">free bed(s)</span>
        <span className="text-muted-foreground">·</span>
        <span className={cn("font-semibold", waitingCount ? "text-amber-600" : "text-muted-foreground")}>
          {waitingCount}
        </span>
        <span className="text-muted-foreground">on board waiting for a bed</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!readOnly && (
            <Button size="sm" disabled={pending || waitingCount === 0} onClick={autoAllocate}>
              Auto-allocate beds
            </Button>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter rooms…"
            className={cn(field, "py-1")}
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
            Only rooms with a free bed
          </label>
        </div>
      </div>

      {allocMsg && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          {allocMsg}
        </p>
      )}
      {!readOnly && waitingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Auto-allocate beds</span> seats everyone waiting — honouring
          fixed cabins first, then filling rooms open to anyone. Gender-restricted rooms are left for
          you to place by hand below.
        </p>
      )}

      {pool.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Nobody is on board yet — empty beds can be filled once people board.
        </p>
      ) : (
        waitingCount === 0 && (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Everyone on board already has a bed. You can still pick someone to move them into a
            different room — they only ever occupy one room at a time.
          </p>
        )
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const beds = r.bed_count || 0;
          const free = Math.max(0, beds - r.occupants.length);
          const over = r.occupied > beds;
          const used = new Set(r.occupants.map((o) => o.bed_no).filter(Boolean) as string[]);
          // Suggested labels for the empty beds: the lowest "Bed N" not already taken.
          const slotLabels: string[] = [];
          let k = 0;
          while (slotLabels.length < free) {
            k++;
            const lbl = `Bed ${k}`;
            if (!used.has(lbl)) slotLabels.push(lbl);
          }
          // Candidates for this room's empty beds: everyone on board except the
          // people already in it. Waiting (bed-less) people sort to the top;
          // placed people read as "move from <their room>".
          const candidates = bedCandidates(pool, r.id, ashorePool, !readOnly);
          return (
            <div key={r.id} className="rounded-md border bg-card p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{labelOf(r) || "—"}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    over ? "text-destructive" : free > 0 ? "text-green-700" : "text-muted-foreground",
                  )}
                >
                  {r.occupied}/{beds}
                  {over ? " · hot-bunk" : free > 0 ? ` · ${free} free` : " · full"}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                <span className="rounded bg-muted px-1 py-0.5">{r.room_type}</span>
                {r.gender_restriction !== "any" && (
                  <span className="rounded bg-muted px-1 py-0.5">{GENDER_LABEL[r.gender_restriction]}</span>
                )}
                {r.status !== "available" && (
                  <span className="rounded bg-muted px-1 py-0.5">{ROOM_STATUS_LABEL[r.status]}</span>
                )}
                {r.lifeboat && <span className="rounded bg-muted px-1 py-0.5">LB {r.lifeboat}</span>}
              </div>

              <ul className="mt-1.5 space-y-1">
                {r.occupants.map((o) => (
                  <li
                    key={o.trip_id}
                    className="flex items-center gap-1.5 rounded bg-muted/40 px-2 py-1 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">{o.bed_no || "•"}</span>
                    <span className="truncate font-medium">{o.name}</span>
                    {o.kind === "visitor" && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        visitor
                      </span>
                    )}
                    {!readOnly && o.kind !== "visitor" && (
                      <button
                        disabled={pending}
                        title={`Unassign ${o.name} from this bed (stays on board, returns to the waiting list)`}
                        onClick={() => run(() => reassignTripRoom(o.trip_id, null))}
                        className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
                {!readOnly &&
                  slotLabels.map((lbl) => (
                    <EmptyBed
                      key={`${r.id}-${lbl}`}
                      roomId={r.id}
                      defaultBed={lbl}
                      candidates={candidates}
                      pending={pending}
                      run={run}
                    />
                  ))}
              </ul>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {usable.length === 0
              ? "No rooms yet."
              : freeOnly
                ? "Every room is full. Untick “Only rooms with a free bed” to see them all."
                : "No room matches that filter."}
          </p>
        )}
      </div>
    </div>
  );
}
