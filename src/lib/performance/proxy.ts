/**
 * Standing in for somebody in the appraisal process.
 *
 * An administrator can take another person's step when that person cannot take
 * it themselves — off the rig, on leave, or signing on paper. What the process
 * needs back is a record saying so: who acted, and for whom. These name the
 * person behind a step, and read that record back afterwards, so a step taken
 * for somebody never reads as their own work.
 */

import { STAGE_ROLE_LABEL, type StageRole } from "@/types/workflow";

/** The people a step can belong to on one appraisal. */
export interface PartyNames {
  employee?: string | null;
  manager?: string | null;
  secondLevel?: string | null;
}

/**
 * Who a step belongs to, named.
 *
 * The timeline could only say "as Line manager", which is no help to an HR
 * admin opening one person's appraisal and needing to know whose signature
 * they are about to stand in for. Falls back to the role alone when the seat
 * is empty or the step belongs to HR rather than to a named person.
 */
export function actingForLabel(role: StageRole, names: PartyNames = {}): string {
  const name =
    role === "employee"
      ? names.employee
      : role === "line_manager"
        ? names.manager
        : role === "second_level"
          ? names.secondLevel
          : null;
  const label = STAGE_ROLE_LABEL[role];
  const clean = name?.trim();
  return clean ? `${clean} · ${label}` : label;
}

export interface ProxyEventLike {
  on_behalf_of_name: string | null;
  created_at: string;
}

/**
 * The steps on this appraisal that somebody took for somebody else, newest
 * first — the answer to "who has been acting here, and for whom".
 */
export function proxyTrail<T extends ProxyEventLike>(events: T[]): T[] {
  return events
    .filter((e) => !!e.on_behalf_of_name)
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}
