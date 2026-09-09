/**
 * The live job's two questions, every few minutes: who departs soon and
 * should be reminded, and what departed and has not started so the desk
 * should hear now. Pure.
 */

export interface LiveTask {
  id: string;
  status: string;
  depart_at: string;
  driver_id: string | null;
  reminded_at: string | null;
  late_alerted_at: string | null;
}

/** Assigned tasks departing within `minutes` that have not been reminded. `minutes <= 0` never reminds. */
export function dueReminders<T extends LiveTask>(tasks: T[], nowIso: string, minutes: number): T[] {
  if (!(minutes > 0)) return [];
  const now = Date.parse(nowIso);
  const until = now + minutes * 60_000;
  return tasks.filter((t) => {
    if (t.status !== "assigned" || !t.driver_id || t.reminded_at) return false;
    const d = Date.parse(t.depart_at);
    return d > now && d <= until;
  });
}

/**
 * Tasks past departure by `minutes` with nobody on the way — still pending
 * or assigned — not yet alerted. `minutes <= 0` never alerts.
 */
export function lateStarts<T extends LiveTask>(tasks: T[], nowIso: string, minutes: number): T[] {
  if (!(minutes > 0)) return [];
  const cutoff = Date.parse(nowIso) - minutes * 60_000;
  return tasks.filter(
    (t) => (t.status === "assigned" || t.status === "pending") && !t.late_alerted_at && Date.parse(t.depart_at) <= cutoff,
  );
}

/** Minutes since departure, for a "late by" badge; negative before departure. */
export function minutesLate(departAt: string, nowIso: string): number {
  return Math.round((Date.parse(nowIso) - Date.parse(departAt)) / 60_000);
}

/** Whether the desk should flag this task on the board right now. */
export function isLateStart(task: Pick<LiveTask, "status" | "depart_at">, nowIso: string, minutes: number): boolean {
  if (!(minutes > 0)) return false;
  return (task.status === "assigned" || task.status === "pending") && minutesLate(task.depart_at, nowIso) >= minutes;
}
