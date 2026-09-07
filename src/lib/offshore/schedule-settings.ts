/**
 * Whether the nightly job may act on the schedule, and what switching it on
 * means — the words behind the confirmation step.
 *
 * Automatic mode has always meant "one click opens the crew change from the
 * schedule". Letting a job take that click overnight is a further step, so it
 * is a separate switch, off until a manager turns it on and confirms, the way
 * a change to the appraisal cycle is confirmed before it happens.
 */

import type { TripMode } from "@/types/offshore";

/** "prompt": the job only reminds and prompts. "act": it opens crew changes itself. */
export type NightlyMode = "prompt" | "act";

export interface OffshoreScheduleSettings {
  mode: TripMode;
  nightly: NightlyMode;
}

/** Hour (UTC) the nightly job runs — matches the cron in vercel.json. */
export const NIGHTLY_RUN_HOUR_UTC = 4;

/** The job acts only when both switches say so. */
export function scheduleActs(s: OffshoreScheduleSettings): boolean {
  return s.mode === "auto" && s.nightly === "act";
}

export function describeNightlySwitch(next: NightlyMode): {
  title: string;
  consequence: string;
  confirmLabel: string;
} {
  if (next === "act") {
    return {
      title: "Let the schedule act overnight?",
      consequence:
        `From tonight, at ${String(NIGHTLY_RUN_HOUR_UTC).padStart(2, "0")}:00 UTC, the rotation schedule will board each crew on its mobilise day and demobilise it at the end of its hitch, with nobody pressing a button. People are told 3 days before and on the day. You can switch back to prompting at any time.`,
      confirmLabel: "Let the schedule act",
    };
  }
  return {
    title: "Stop the schedule acting overnight?",
    consequence:
      "The nightly job will still remind people 3 days before a crew change and prompt the desk on the day, but crew changes will wait for a click on the dashboard.",
    confirmLabel: "Prompt only",
  };
}
