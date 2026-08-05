/**
 * Pure rotation-cycle arithmetic (no I/O) — the date maths behind crew
 * scheduling, extracted so it can be unit-tested and shared. All dates are
 * ISO `YYYY-MM-DD` strings treated as UTC days.
 */

export const DAY_MS = 86_400_000;

export interface RotationCycle {
  offshore_days: number;
  onshore_days: number;
  cycle_start_date: string | null;
}

const dayMs = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * 0-based day index of `todayIso` within the crew's rotation period, or null
 * when the crew has no usable cycle. Index < offshore_days ⇒ the crew is in
 * its offshore phase.
 */
export function cycleDayIndex(cycle: RotationCycle, todayIso: string): number | null {
  const period = cycle.offshore_days + cycle.onshore_days;
  if (!cycle.cycle_start_date || period <= 0) return null;
  const start = dayMs(cycle.cycle_start_date);
  const today = dayMs(todayIso);
  return ((Math.floor((today - start) / DAY_MS) % period) + period) % period;
}

/**
 * The crew's current offshore window: when today falls inside an offshore
 * phase, the window is that phase (backdated to its start); otherwise it
 * defaults to [today, today + offshore_days] — matching how ad-hoc boarding
 * has always behaved.
 */
export function scheduleWindow(
  cycle: RotationCycle,
  todayIso: string,
): { fromIso: string; toIso: string } {
  const today = dayMs(todayIso);
  let from = today;
  let to = today + cycle.offshore_days * DAY_MS;
  const idx = cycleDayIndex(cycle, todayIso);
  if (idx !== null && idx < cycle.offshore_days) {
    from = today - idx * DAY_MS;
    to = from + cycle.offshore_days * DAY_MS;
  }
  return { fromIso: toIso(from), toIso: toIso(to) };
}

/** Next date a crew starts an offshore period, on/after today, from its cycle. */
export function nextChangeDate(cycle: RotationCycle, todayIso: string): string | null {
  const period = cycle.offshore_days + cycle.onshore_days;
  if (!cycle.cycle_start_date || period <= 0) return null;
  const start = dayMs(cycle.cycle_start_date);
  const now = dayMs(todayIso);
  let n = 0;
  if (now > start) n = Math.ceil((now - start) / (period * DAY_MS));
  return toIso(start + n * period * DAY_MS);
}
