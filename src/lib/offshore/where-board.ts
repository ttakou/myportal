/**
 * The whole platform the way "Where is…" shows one person.
 *
 * The OIM's question in an emergency, or a Monday morning, is not "where is
 * X" but "who is on board, where do they muster, and does the record agree
 * with the schedule". This takes one row per person from the roster and
 * gives the counts and the groupings; the page draws them. Pure.
 */

import type { CrewStatusKind } from "./crew-change";
import type { BedSource } from "./bed-for";

export type BoardKind = CrewStatusKind | "no_schedule";

export interface BoardRow {
  id: string;
  name: string;
  crew: string | null;
  lifeboat: string | null;
  /** "Room 308 · Bed 1", from the trip while on board, else the roster default. */
  bed: string | null;
  bedSource: BedSource;
  installation: string | null;
  /** True when a recorded trip has them on board today. */
  onBoard: boolean;
  /** The schedule's reading against the record; "no_schedule" for no crew or cycle. */
  kind: BoardKind;
  /** Next crew change from the schedule, when there is one. */
  nextChange: string | null;
  daysToChange: number | null;
  isRotational: boolean;
}

export const KIND_LABEL: Record<BoardKind, string> = {
  offshore: "Offshore",
  onshore: "Onshore",
  due_offshore: "Due offshore, not boarded",
  overdue_off: "Overdue off",
  off_early: "Came off early",
  no_schedule: "No schedule",
};

/** Kinds where the record disagrees with the schedule: the OIM's to-do list. */
export const EXCEPTION_KINDS: readonly BoardKind[] = ["due_offshore", "overdue_off", "off_early"];

export function isException(kind: BoardKind): boolean {
  return EXCEPTION_KINDS.includes(kind);
}

export interface BoardSummary {
  total: number;
  /** The schedule puts them offshore today. */
  scheduledOffshore: number;
  /** A trip has them on board today. */
  onBoard: number;
  dueOffshore: number;
  overdueOff: number;
  offEarly: number;
  noSchedule: number;
  /** On board with no muster station: the ones a roll-call cannot place. */
  onBoardNoLifeboat: number;
}

export function boardSummary(rows: BoardRow[]): BoardSummary {
  const s: BoardSummary = {
    total: rows.length,
    scheduledOffshore: 0,
    onBoard: 0,
    dueOffshore: 0,
    overdueOff: 0,
    offEarly: 0,
    noSchedule: 0,
    onBoardNoLifeboat: 0,
  };
  for (const r of rows) {
    if (r.kind === "offshore" || r.kind === "due_offshore" || r.kind === "off_early") s.scheduledOffshore += 1;
    if (r.onBoard) {
      s.onBoard += 1;
      if (!r.lifeboat) s.onBoardNoLifeboat += 1;
    }
    if (r.kind === "due_offshore") s.dueOffshore += 1;
    else if (r.kind === "overdue_off") s.overdueOff += 1;
    else if (r.kind === "off_early") s.offEarly += 1;
    else if (r.kind === "no_schedule") s.noSchedule += 1;
  }
  return s;
}

export type BoardGrouping = "lifeboat" | "cabin" | "crew";

export const BOARD_GROUPINGS: { key: BoardGrouping; label: string }[] = [
  { key: "lifeboat", label: "By muster station" },
  { key: "cabin", label: "By cabin" },
  { key: "crew", label: "By crew" },
];

export const UNGROUPED = "Not assigned";

export interface BoardGroup {
  key: string;
  rows: BoardRow[];
  onBoard: number;
}

const roomOf = (bed: string | null) => (bed ? bed.split(" · ")[0] : null);

/**
 * Rows in groups, sorted by name inside each; "Not assigned" last. Grouping by
 * cabin uses the room, not the bed, so two people in one cabin sit together.
 */
export function groupRows(rows: BoardRow[], by: BoardGrouping): BoardGroup[] {
  const groups = new Map<string, BoardRow[]>();
  for (const r of rows) {
    const key =
      (by === "lifeboat" ? r.lifeboat : by === "cabin" ? roomOf(r.bed) : r.crew) || UNGROUPED;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      rows: [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
      onBoard: list.filter((r) => r.onBoard).length,
    }))
    .sort((a, b) =>
      a.key === UNGROUPED ? 1 : b.key === UNGROUPED ? -1 : a.key.localeCompare(b.key, undefined, { numeric: true }),
    );
}

export type BoardFilter = "all" | "onboard" | "exceptions";

export function filterRows(rows: BoardRow[], only: BoardFilter): BoardRow[] {
  if (only === "onboard") return rows.filter((r) => r.onBoard);
  if (only === "exceptions") return rows.filter((r) => isException(r.kind));
  return rows;
}
