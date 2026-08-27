/**
 * Phase deadlines as dates rather than day-counts.
 *
 * A stage stores its deadline as `dueOffsetDays` — days from the cycle's start —
 * so the same process re-dates itself every year. That is right for storage and
 * wrong for editing: setting the goal-setting deadline to 31 March meant working
 * out that it is day 89. These convert between the two so HR can type the date.
 */

import { stageDueDate } from "@/lib/workflow-engine";
import type { WorkflowStage } from "@/types/workflow";

const DAY_MS = 86_400_000;

const dayMs = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();

/** Days from the cycle's start to `date`. Negative when the date precedes it. */
export function offsetFromDate(cycleStart: string, date: string): number {
  return Math.round((dayMs(date) - dayMs(cycleStart)) / DAY_MS);
}

export interface StageDate {
  key: string;
  label: string;
  /** The date this step is due, as currently stored. */
  date: string;
}

/** Each stage's deadline as a date, in order — what the editor starts from. */
export function stageDates(stages: WorkflowStage[], cycleStart: string): StageDate[] {
  return stages.map((s) => ({
    key: s.key,
    label: s.label,
    date: stageDueDate(s, cycleStart),
  }));
}

/**
 * Check a proposed set of dates before writing it.
 *
 * The order of the steps is fixed by the process, so their dates have to run
 * the same way: a step due before the one it follows would show as overdue
 * from the day the cycle opens, and the phase rail would read the cycle as
 * being somewhere it is not. Returns an error to show, or null when it is fine.
 */
export function validateStageDates(
  stages: WorkflowStage[],
  dates: Record<string, string>,
  cycleStart: string,
): string | null {
  const ordered = stages.map((s) => ({ stage: s, date: dates[s.key] }));

  for (const { stage, date } of ordered) {
    if (!date) return `${stage.label} has no date.`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${stage.label} has an invalid date.`;
    if (Number.isNaN(dayMs(date))) return `${stage.label} has an invalid date.`;
  }

  const before = ordered.find(({ date }) => offsetFromDate(cycleStart, date) < 0);
  if (before) {
    return `${before.stage.label} is dated before the cycle starts on ${cycleStart}.`;
  }

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (curr.date < prev.date) {
      return `${curr.stage.label} is dated before ${prev.stage.label}, which comes first.`;
    }
  }

  return null;
}

/** Apply the dates to the stages, converting each back to a day offset. */
export function applyStageDates(
  stages: WorkflowStage[],
  dates: Record<string, string>,
  cycleStart: string,
): WorkflowStage[] {
  return stages.map((s) =>
    dates[s.key] ? { ...s, dueOffsetDays: offsetFromDate(cycleStart, dates[s.key]) } : { ...s },
  );
}
