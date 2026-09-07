/**
 * What a muster roll-call adds up to, and what closing it out means.
 *
 * A tick per person told the OIM who had reached their station; it said
 * nothing about the rest. Somebody unticked at the end of a drill is one of
 * three things — they failed to muster, they were never on board (the POB
 * snapshot was stale), or the drill was abandoned — and the report has to
 * say which. Pure: check-ins in, counts and words out.
 */

export type MusterOutcome = "accounted" | "no_show" | "not_on_board";

export const MUSTER_OUTCOME_LABEL: Record<MusterOutcome, string> = {
  accounted: "Accounted",
  no_show: "No-show",
  not_on_board: "Not on board",
};

export interface CloseoutCheckin {
  id: string;
  name: string;
  lifeboat: string | null;
  outcome: MusterOutcome | null;
  accounted_at: string | null;
}

export interface LifeboatSummary {
  lifeboat: string;
  total: number;
  accounted: number;
  noShow: number;
  notOnBoard: number;
  open: number;
}

export interface MusterSummary {
  total: number;
  accounted: number;
  noShow: number;
  notOnBoard: number;
  /** Still without an outcome. */
  open: number;
  /** Those the muster was for: everyone but the ones who were never on board. */
  expected: number;
  /** When the last expected person was accounted, if everybody was. */
  allClearAt: string | null;
  secondsToAllClear: number | null;
  byLifeboat: LifeboatSummary[];
}

export const UNASSIGNED = "Unassigned";

export function musterSummary(checkins: CloseoutCheckin[], startedAt: string): MusterSummary {
  const groups = new Map<string, LifeboatSummary>();
  let accounted = 0;
  let noShow = 0;
  let notOnBoard = 0;
  let open = 0;
  let lastAccounted: string | null = null;
  for (const c of checkins) {
    const key = c.lifeboat || UNASSIGNED;
    const g = groups.get(key) ?? { lifeboat: key, total: 0, accounted: 0, noShow: 0, notOnBoard: 0, open: 0 };
    g.total += 1;
    if (c.outcome === "accounted") {
      accounted += 1;
      g.accounted += 1;
      if (c.accounted_at && (!lastAccounted || c.accounted_at > lastAccounted)) lastAccounted = c.accounted_at;
    } else if (c.outcome === "no_show") {
      noShow += 1;
      g.noShow += 1;
    } else if (c.outcome === "not_on_board") {
      notOnBoard += 1;
      g.notOnBoard += 1;
    } else {
      open += 1;
      g.open += 1;
    }
    groups.set(key, g);
  }
  const expected = checkins.length - notOnBoard;
  const allClear = expected > 0 && open === 0 && noShow === 0;
  const allClearAt = allClear ? lastAccounted : null;
  return {
    total: checkins.length,
    accounted,
    noShow,
    notOnBoard,
    open,
    expected,
    allClearAt,
    secondsToAllClear: allClearAt
      ? Math.max(0, Math.round((Date.parse(allClearAt) - Date.parse(startedAt)) / 1000))
      : null,
    byLifeboat: [...groups.values()].sort((a, b) =>
      a.lifeboat === UNASSIGNED ? 1 : b.lifeboat === UNASSIGNED ? -1 : a.lifeboat.localeCompare(b.lifeboat),
    ),
  };
}

/** "3:42" for a duration in seconds. */
export function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** One line for the report header. */
export function musterHeadline(s: MusterSummary): string {
  if (s.total === 0) return "Nobody on board at the time.";
  if (s.open > 0) return `${s.accounted} of ${s.expected} accounted · ${s.open} still open`;
  if (s.noShow > 0) return `${s.accounted} of ${s.expected} accounted · ${s.noShow} no-show`;
  return s.secondsToAllClear != null
    ? `All ${s.expected} accounted · all clear in ${mmss(s.secondsToAllClear)}`
    : `All ${s.expected} accounted`;
}

/** The words behind the close-out confirmation. */
export function describeCloseOut(
  s: MusterSummary,
  remaining: Exclude<MusterOutcome, "accounted">,
): { title: string; consequence: string; confirmLabel: string } {
  const rest = s.open;
  const restLine =
    rest === 0
      ? "Everyone has an outcome."
      : `${rest} ${rest === 1 ? "person" : "people"} still open will be recorded as ${MUSTER_OUTCOME_LABEL[remaining].toLowerCase()}.`;
  return {
    title: "Close out this roll-call?",
    consequence: `${restLine} The roll-call ends and the report is final: ${s.accounted} accounted, ${s.noShow + (remaining === "no_show" ? rest : 0)} no-show, ${s.notOnBoard + (remaining === "not_on_board" ? rest : 0)} not on board.`,
    confirmLabel: "Close out",
  };
}
