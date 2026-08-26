/**
 * When a scheduled notification rule should fire.
 *
 * The notification settings have always let an administrator configure
 * "Upcoming deadline" and "Overdue task" rules with a timing and an offset, and
 * those rules were saved and shown as enabled — but neither event was ever
 * raised, so they had never sent a single message. This is the timing decision
 * that makes them real.
 *
 * Pure, so the rule an administrator sees on the settings screen and the
 * message that actually goes out cannot drift apart.
 */

import type { Frequency, Timing } from "@/types/notifications";

const DAY_MS = 86_400_000;

/** Whole days from `fromIso` to `toIso`; negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

export interface ScheduledRule {
  timing: Timing;
  offsetDays: number;
  frequency: Frequency;
}

/**
 * Does this rule fire today, for a step due on `dueDate`?
 *
 * "Before" counts down to the deadline, "after" counts up from it. A `once`
 * rule speaks on exactly its offset day; `daily` and `until_complete` keep
 * speaking from that day onward — up to the deadline for a warning, and
 * indefinitely for a chase, since the sweep only ever looks at steps nobody has
 * taken yet.
 */
export function ruleFiresToday(
  rule: ScheduledRule,
  input: { dueDate: string; today: string },
): boolean {
  const offset = Math.max(0, Math.floor(rule.offsetDays || 0));
  const daysUntilDue = daysBetween(input.today, input.dueDate);
  const repeats = rule.frequency === "daily" || rule.frequency === "until_complete";

  if (rule.timing === "before") {
    // Warning territory: only before the deadline, never after it has passed.
    if (daysUntilDue < 0) return false;
    return repeats ? daysUntilDue <= offset : daysUntilDue === offset;
  }

  if (rule.timing === "after") {
    const daysLate = -daysUntilDue;
    if (daysLate < 0) return false;
    return repeats ? daysLate >= offset : daysLate === offset;
  }

  // "Immediate" rules belong to the action that triggers them, not to a sweep.
  return false;
}

/** The event a due date warrants today, or null when it warrants nothing. */
export function deadlineEventFor(input: {
  dueDate: string;
  today: string;
}): "upcoming_deadline" | "overdue_task" | null {
  const daysUntilDue = daysBetween(input.today, input.dueDate);
  if (daysUntilDue < 0) return "overdue_task";
  return "upcoming_deadline";
}

/** Human phrasing for a due date, used in the message body. */
export function deadlinePhrase(input: { dueDate: string; today: string }): string {
  const days = daysBetween(input.today, input.dueDate);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days > 1) return `due in ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${Math.abs(days)} days overdue`;
}
