// Pure scheduling logic for the training scheduler. Given a pool of candidates
// (with rotation + busy dates) and parameters, it packs people into
// capacity-sized sessions of a fixed duration, only booking a person into a
// session they're available for end-to-end. No I/O — unit tested & reused for
// client-side re-validation.

const DAY_MS = 86_400_000;

export interface CrewRotation {
  cycleStart: string; // ISO
  offshoreDays: number;
  onshoreDays: number;
}

export interface TrainingCandidate {
  profileId: string;
  name: string;
  /** Rotation for offshore staff; null = always available (onshore). */
  crew?: CrewRotation | null;
  /** ISO dates blocked by existing training or a medical visit (hard block). */
  busyDates?: string[];
}

export interface TrainingPlanParams {
  startDate: string; // ISO yyyy-mm-dd — first session start
  sessionDays: number; // duration of each session in days
  capacity: number; // max participants per session
  gapDays?: number; // gap between consecutive sessions (default 0)
  maxSessions?: number; // hard cap on generated session slots
}

export interface PlannedSession {
  index: number;
  startDate: string;
  endDate: string;
  members: { profileId: string; name: string }[];
}

export interface TrainingPlan {
  sessions: PlannedSession[];
  unscheduled: { profileId: string; name: string; reason: string }[];
}

/* ---- date helpers (UTC, ISO) -------------------------------------------- */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function iso(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
function addDays(isoDate: string, n: number): string {
  return iso(new Date(d(isoDate).getTime() + n * DAY_MS));
}
function rangeDays(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (let cur = startIso; cur <= endIso; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

/** Is the crew onshore on `isoDate`? Mirrors the crew-change rotation math. */
export function isOnshoreOn(crew: CrewRotation | null | undefined, isoDate: string): boolean {
  if (!crew || !crew.cycleStart) return true;
  const period = crew.offshoreDays + crew.onshoreDays;
  if (period <= 0) return true;
  const diff = Math.floor((d(isoDate).getTime() - d(crew.cycleStart).getTime()) / DAY_MS);
  const idx = ((diff % period) + period) % period;
  return idx >= crew.offshoreDays;
}

/** Can this person attend the whole [start,end] window? */
export function availableForRange(
  c: TrainingCandidate,
  startIso: string,
  endIso: string,
): { ok: boolean; reason?: string } {
  const busy = new Set(c.busyDates ?? []);
  for (const day of rangeDays(startIso, endIso)) {
    if (!isOnshoreOn(c.crew, day)) return { ok: false, reason: "offshore (rotation)" };
    if (busy.has(day)) return { ok: false, reason: "training/medical conflict" };
  }
  return { ok: true };
}

/** Generate the ordered session slots (index, start, end). */
export function sessionSlots(params: TrainingPlanParams, count: number): PlannedSession[] {
  const gap = Math.max(0, params.gapDays ?? 0);
  const span = Math.max(1, params.sessionDays);
  const slots: PlannedSession[] = [];
  let start = params.startDate;
  for (let i = 0; i < count; i++) {
    const end = addDays(start, span - 1);
    slots.push({ index: i, startDate: start, endDate: end, members: [] });
    start = addDays(end, 1 + gap);
  }
  return slots;
}

/** Offshore (rotation-constrained) first, then by name — tight windows go early. */
function byPriority(a: TrainingCandidate, b: TrainingCandidate): number {
  const ao = a.crew ? 0 : 1;
  const bo = b.crew ? 0 : 1;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
}

export function planTraining(
  params: TrainingPlanParams,
  candidates: TrainingCandidate[],
): TrainingPlan {
  const cap = Math.max(1, params.capacity);
  const n = candidates.length;
  const slotCount = Math.min(
    params.maxSessions ?? 52,
    Math.max(1, Math.ceil(n / cap) + 12),
  );
  const slots = sessionSlots(params, slotCount);
  const unscheduled: TrainingPlan["unscheduled"] = [];

  for (const c of [...candidates].sort(byPriority)) {
    let placed = false;
    let sawBlocked = false;
    for (const slot of slots) {
      if (slot.members.length >= cap) continue;
      const a = availableForRange(c, slot.startDate, slot.endDate);
      if (!a.ok) {
        sawBlocked = true;
        continue;
      }
      slot.members.push({ profileId: c.profileId, name: c.name });
      placed = true;
      break;
    }
    if (!placed) {
      unscheduled.push({
        profileId: c.profileId,
        name: c.name,
        reason: sawBlocked
          ? "Offshore or conflicting on every available session"
          : "No session slot with free capacity in range",
      });
    }
  }

  return { sessions: slots.filter((s) => s.members.length > 0), unscheduled };
}
