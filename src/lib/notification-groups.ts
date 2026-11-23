/**
 * Sorting the bell: which group a notice belongs to, and which notices are
 * decisions due before the next nightly offshore run.
 *
 * Pure: notices in, decisions out.
 */

export type NoticeGroup = "offshore" | "performance" | "transport" | "other";

export const NOTICE_GROUPS: { key: NoticeGroup; label: string }[] = [
  { key: "offshore", label: "Offshore" },
  { key: "performance", label: "Performance" },
  { key: "transport", label: "Transport" },
  { key: "other", label: "Other" },
];

/** The modules (link segments) each group gathers; "other" is everything else. */
export const GROUP_MODULES: Record<Exclude<NoticeGroup, "other">, string[]> = {
  offshore: ["offshore", "offshore-pob", "offshore-manifest"],
  performance: ["performance", "appraisals", "training"],
  transport: ["transportation", "transport", "out-of-town"],
};

const GROUP_OF_MODULE: Record<string, NoticeGroup> = {
  offshore: "offshore",
  "offshore-pob": "offshore",
  "offshore-manifest": "offshore",
  performance: "performance",
  appraisals: "performance",
  training: "performance",
  transportation: "transport",
  transport: "transport",
  "out-of-town": "transport",
};

/** The module named on the notice, else the first segment of its link. */
export function noticeModule(n: { module?: string | null; url?: string | null }): string | null {
  if (n.module) return n.module;
  if (!n.url || !n.url.startsWith("/")) return null;
  return n.url.slice(1).split(/[/?#]/)[0] || null;
}

export function noticeGroup(n: { module?: string | null; url?: string | null }): NoticeGroup {
  const m = noticeModule(n);
  return (m && GROUP_OF_MODULE[m]) || "other";
}

/** The nightly offshore run: 04:00 UTC (05:00 in Douala). */
export const NIGHTLY_RUN_UTC_HOUR = 4;

/**
 * The last moment to decide something that takes effect on `dateIso`: the
 * nightly run that morning carries out whatever is approved by then.
 */
export function decideBy(dateIso: string | null | undefined): string | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  return `${dateIso}T${String(NIGHTLY_RUN_UTC_HOUR).padStart(2, "0")}:00:00.000Z`;
}

/** The earlier of two dates (either may be missing). */
export function earlierDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

/** Pinned on top: unread, with a deadline still ahead and within the window. */
export function isUrgent(
  n: { read_at?: string | null; due_at?: string | null },
  now: Date,
  windowHours = 36,
): boolean {
  if (n.read_at || !n.due_at) return false;
  const left = Date.parse(n.due_at) - now.getTime();
  return left > 0 && left <= windowHours * 3_600_000;
}

/** "Decide before 05:00 today / tomorrow / on 26 Nov" on the site's clock. */
export function dueLabel(dueAt: string, now: Date): string {
  const tz = "Africa/Douala";
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const due = new Date(dueAt);
  const time = due.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const today = day(now);
  const tomorrow = day(new Date(now.getTime() + 86_400_000));
  const when =
    day(due) === today
      ? "today"
      : day(due) === tomorrow
        ? "tomorrow"
        : `on ${due.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" })}`;
  return when === "today" || when === "tomorrow"
    ? `Decide before tonight's run (${time} ${when})`
    : `Decide before ${time} ${when} (nightly run)`;
}

/**
 * A trip request notice covers every trip it created (one per person); its
 * reference lists them, so the notice can clear once none is still waiting.
 */
export function tripsRef(tripIds: string[]): string | null {
  const ids = [...new Set(tripIds.filter(Boolean))].sort();
  return ids.length ? `trips:${ids.join(",")}` : null;
}

export function tripIdsOfRef(ref: string | null | undefined): string[] {
  if (!ref || !ref.startsWith("trips:")) return [];
  return ref.slice(6).split(",").filter(Boolean);
}
