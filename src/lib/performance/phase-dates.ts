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

export interface StageShift {
  key: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Move one deadline, and carry the order with it.
 *
 * Editing a phase boundary in place is editing one step's deadline, and the
 * steps run in a fixed order — so pulling a phase's end back before one of its
 * own steps, or in front of the phase after it, would leave the sequence
 * invalid. Rejecting that would make the field unusable: the whole point of
 * typing a date on the board is not to reason about fourteen steps first.
 *
 * So the neighbours give way, and only as far as they must: steps before the
 * one moved are pulled back to meet it, steps after are pushed forward. Every
 * date that changes is reported, because a phase quietly dragging two others
 * with it is exactly the sort of thing HR should be told about.
 */
export function setStageDate(
  stages: WorkflowStage[],
  key: string,
  date: string,
  cycleStart: string,
): { stages: WorkflowStage[]; moved: StageShift[] } {
  const before = stages.map((s) => stageDueDate(s, cycleStart));
  const index = stages.findIndex((s) => s.key === key);
  if (index === -1) return { stages, moved: [] };

  const after = [...before];
  after[index] = date;
  // Backwards: nothing may sit after the step that follows it.
  for (let i = index - 1; i >= 0; i--) if (after[i] > after[i + 1]) after[i] = after[i + 1];
  // Forwards: nothing may sit before the step it follows.
  for (let i = index + 1; i < after.length; i++) if (after[i] < after[i - 1]) after[i] = after[i - 1];

  const moved: StageShift[] = [];
  stages.forEach((s, i) => {
    if (after[i] !== before[i]) moved.push({ key: s.key, label: s.label, from: before[i], to: after[i] });
  });

  return {
    stages: stages.map((s, i) => ({ ...s, dueOffsetDays: offsetFromDate(cycleStart, after[i]) })),
    moved,
  };
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
