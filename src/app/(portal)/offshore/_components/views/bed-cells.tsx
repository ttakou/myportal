"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type BedCandidate } from "@/lib/offshore/bed-candidates";
import { SearchSelect } from "@/components/ui/search-select";
import { type Room } from "@/types/offshore";
import { boardMember, reassignTripRoom, updateRosterMember } from "../../actions";

/**
 * The three states of a bed — occupied, owned but empty, free — drawn the
 * same way on the rooms list and the bed board.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

/**
 * One live occupant on the occupancy card: rename their bed (saved on blur) or
 * lift them out of it. Unassigning keeps them on board — they drop back into the
 * "waiting for a bed" pool.
 */
export function OccupantRow({
  occupant,
  roomId,
  clashes = false,
  pending,
  run,
}: {
  occupant: Room["occupants"][number];
  roomId: string;
  /** True when somebody else in this room holds the same bed. */
  clashes?: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const original = occupant.bed_no ?? "";
  const [bed, setBed] = useState(original);
  // Re-sync when the server sends a different value (e.g. after auto-allocate).
  useEffect(() => setBed(original), [original]);
  return (
    <li className="flex items-center gap-1.5 rounded bg-muted/40 px-1.5 py-1 text-xs">
      <input
        value={bed}
        disabled={pending}
        aria-label={`Bed for ${occupant.name}`}
        placeholder="•"
        onChange={(e) => setBed(e.target.value)}
        onBlur={() => {
          if (bed.trim() !== original) run(() => reassignTripRoom(occupant.trip_id, roomId, bed));
        }}
        title={clashes ? "Someone else in this room holds this bed" : undefined}
        className={cn(
          "w-14 shrink-0 rounded border bg-background px-1 py-0.5 font-mono text-[11px]",
          clashes && "border-destructive font-semibold text-destructive",
        )}
      />
      <span className="truncate font-medium">{occupant.name}</span>
      <button
        disabled={pending}
        title={`Unassign ${occupant.name} from this bed (stays on board, returns to the waiting list)`}
        onClick={() => run(() => reassignTripRoom(occupant.trip_id, null))}
        className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/**
 * One cabin owner on the occupancy card — the roster's fixed cabin, not a live
 * trip. Editing the bed or clearing the owner writes straight to the roster row,
 * exactly as the Roster tab's fixed-room fields do.
 */
export function OwnerRow({
  owner,
  staffId,
  aboard = false,
  pending,
  run,
}: {
  owner: Room["owners"][number];
  staffId: string | null;
  /** False when they are on their off-rotation, so they can hold no bed. */
  aboard?: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const original = owner.bed ?? "";
  const [bed, setBed] = useState(original);
  useEffect(() => setBed(original), [original]);
  // Owners always resolve to a roster row; guard anyway so a stale render can't
  // fire an update with no id.
  const editable = Boolean(staffId) && !pending;
  return (
    <li className="flex items-center gap-1">
      <input
        value={bed}
        disabled={!editable}
        aria-label={`Fixed bed for ${owner.name}`}
        placeholder="•"
        onChange={(e) => setBed(e.target.value)}
        onBlur={() => {
          if (staffId && bed.trim() !== original) run(() => updateRosterMember({ id: staffId, fixedBed: bed }));
        }}
        className="w-14 shrink-0 rounded border bg-background px-1 py-0.5 font-mono text-[11px]"
      />
      <span className="truncate">{owner.name}</span>
      {!aboard && (
        <span
          className="shrink-0 text-muted-foreground/70"
          title="Ashore on their off-rotation — board them before they can take a bed"
        >
          · ashore
        </span>
      )}
      {owner.back_to_back ? <span className="shrink-0 text-muted-foreground/70">⇄ {owner.back_to_back}</span> : null}
      <button
        disabled={!editable}
        title={`Remove ${owner.name} as an owner of this cabin (clears their fixed cabin)`}
        onClick={() => staffId && run(() => updateRosterMember({ id: staffId, fixedRoomId: null }))}
        className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/**
 * One empty bed slot: an editable bed label + a picker that places the chosen
 * on-board person into this bed on select. Picking someone already in another
 * room moves them here (a single trip, so one room at a time).
 */
export function EmptyBed({
  roomId,
  defaultBed,
  candidates,
  pending,
  run,
}: {
  roomId: string;
  defaultBed: string;
  candidates: BedCandidate[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [bed, setBed] = useState(defaultBed);
  return (
    <li className="flex items-center gap-1.5 rounded border border-dashed bg-background px-2 py-1 text-xs">
      <input
        value={bed}
        onChange={(e) => setBed(e.target.value)}
        aria-label="Bed label"
        className="w-16 shrink-0 rounded border bg-background px-1 py-0.5 font-mono text-[11px]"
      />
      <SearchSelect
        value={null}
        options={candidates}
        getOptionValue={(p) => p.id}
        getOptionLabel={(p) => p.label}
        placeholder={candidates.length ? "Type a name to assign / move…" : "— nobody available —"}
        disabled={pending || candidates.length === 0}
        wrapperClassName="flex-1"
        className="w-full rounded border bg-background px-1 py-0.5 text-[11px]"
        onChange={(v) => {
          const pick = candidates.find((c) => c.id === v);
          if (!pick) return;
          // "board" carries a profile id and puts an ashore person on board in
          // the same step; "move" carries a trip id and only reseats them.
          if (pick.kind === "board") {
            run(() => boardMember(pick.id, { roomId, bedNo: bed.trim() || null }));
          } else {
            run(() => reassignTripRoom(pick.id, roomId, bed.trim() || null));
          }
        }}
      />
    </li>
  );
}
