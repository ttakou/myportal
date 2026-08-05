/**
 * The visitor work queues a Campboss needs on sight.
 *
 * Approval and accommodation are handled by different people: the OIM decides
 * whether a visit happens, the Campboss finds the bed. Nothing connected the
 * two — an approved visitor needing a room appeared only as one card among all
 * visitors on the Visitors tab, with no count, no queue and no prompt. All
 * three approved visitors in production are sitting unallocated.
 *
 * These are grouped by installation because a Campboss runs one platform and
 * cares only about their own.
 */

export interface QueueVisit {
  id: string;
  visitor_name: string;
  visitor_company: string | null;
  status: string;
  depart_date: string;
  return_date: string | null;
  accommodation_required: boolean;
  installation_id: string | null;
  installation_name: string | null;
  /** Null when no bed has been given yet. */
  allocation: unknown | null;
}

export interface VisitorQueueGroup {
  installation_id: string | null;
  installation_name: string;
  visits: QueueVisit[];
}

/** Group visits by installation, alphabetically, each group date-ordered. */
function groupByInstallation(visits: readonly QueueVisit[]): VisitorQueueGroup[] {
  const groups = new Map<string, VisitorQueueGroup>();
  for (const v of visits) {
    const key = v.installation_id ?? "__none__";
    const group = groups.get(key) ?? {
      installation_id: v.installation_id,
      installation_name: v.installation_name ?? "No installation set",
      visits: [],
    };
    group.visits.push(v);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      visits: [...g.visits].sort(
        (a, b) => a.depart_date.localeCompare(b.depart_date) || a.visitor_name.localeCompare(b.visitor_name),
      ),
    }))
    .sort((a, b) => a.installation_name.localeCompare(b.installation_name));
}

/**
 * Approved visitors who need a bed and do not have one — the Campboss's
 * booking queue.
 *
 * `onboard` is included: somebody already offshore without a bed is a worse
 * problem than one still ashore, not a resolved one. A visit that needs no
 * accommodation (a day trip) never appears.
 */
export function visitorsAwaitingBed(visits: readonly QueueVisit[]): VisitorQueueGroup[] {
  return groupByInstallation(
    visits.filter(
      (v) =>
        (v.status === "approved" || v.status === "onboard") &&
        v.accommodation_required &&
        !v.allocation,
    ),
  );
}

/** Total across every installation, for a headline count. */
export function countAwaitingBed(groups: readonly VisitorQueueGroup[]): number {
  return groups.reduce((n, g) => n + g.visits.length, 0);
}

/**
 * Approved visitors due to arrive on `dateIso` — what the Campboss should be
 * expecting today, whether or not they need a bed.
 */
export function visitorsArrivingOn(
  visits: readonly QueueVisit[],
  dateIso: string,
): VisitorQueueGroup[] {
  return groupByInstallation(
    visits.filter((v) => v.status === "approved" && v.depart_date === dateIso),
  );
}
