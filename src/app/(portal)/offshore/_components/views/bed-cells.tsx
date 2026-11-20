"use client";

import { X } from "lucide-react";
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
 * One live occupant on the occupancy card: lift them out of the room. Unassigning keeps them on board — they drop back into the
 * "waiting for a bed" pool.
 */
export function OccupantRow({
  occupant,
  pending,
  run,
}: {
  occupant: Room["occupants"][number];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  return (
    <li className="flex items-center gap-1.5 rounded bg-muted/40 px-1.5 py-1 text-xs">
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
 * trip. Clearing the owner writes straight to the roster row, exactly as the
 * Roster tab's fixed-room fields do.
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
  // Owners always resolve to a roster row; guard anyway so a stale render can't
  // fire an update with no id.
  const editable = Boolean(staffId) && !pending;
  return (
    <li className="flex items-center gap-1">
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
 * One empty bed slot: a picker that places the chosen
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
  // The bed label is bookkeeping only (it keeps two people off one berth); it
  // is not shown, so the next free one is used as is.
  const bed = defaultBed;
  return (
    <li className="flex items-center gap-1.5 rounded border border-dashed bg-background px-2 py-1 text-xs">
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
