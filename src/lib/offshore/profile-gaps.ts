/**
 * What is missing from somebody's offshore profile, in their words.
 *
 * The roster carried blanks where the safety data belongs, and the person
 * concerned was the one who could fill them and the one never asked. This
 * reads one roster row and says what to ask for, so the dashboard can put
 * the question to them. Pure: a row and today's date in, a list out.
 */

export type GapKey = "medical" | "bosiet" | "huet" | "emergency_contact" | "back_to_back";

export interface ProfileGap {
  key: GapKey;
  label: string;
  /** Why it matters, one line. */
  why: string;
  /** "missing", or "expired" when a date is recorded but past. */
  state: "missing" | "expired";
  /** The expired date, when state is "expired". */
  date?: string;
}

export interface ProfileForGaps {
  medical_expiry: string | null;
  bosiet_expiry: string | null;
  huet_expiry: string | null;
  emergency_contact: string | null;
  back_to_back_id: string | null;
  is_rotational: boolean;
}

const CERTS: { key: GapKey; field: keyof ProfileForGaps; label: string; why: string }[] = [
  {
    key: "medical",
    field: "medical_expiry",
    label: "Offshore medical",
    why: "Nobody boards without a medical in date.",
  },
  {
    key: "bosiet",
    field: "bosiet_expiry",
    label: "BOSIET",
    why: "Basic offshore safety induction and emergency training.",
  },
  {
    key: "huet",
    field: "huet_expiry",
    label: "HUET",
    why: "Helicopter underwater escape, needed for every flight out.",
  },
];

export function offshoreProfileGaps(p: ProfileForGaps, todayIso: string): ProfileGap[] {
  const out: ProfileGap[] = [];
  for (const c of CERTS) {
    const date = p[c.field] as string | null;
    if (!date) out.push({ key: c.key, label: c.label, why: c.why, state: "missing" });
    else if (date < todayIso) out.push({ key: c.key, label: c.label, why: c.why, state: "expired", date });
  }
  if (!p.emergency_contact?.trim()) {
    out.push({
      key: "emergency_contact",
      label: "Emergency contact",
      why: "Who the OIM calls if something happens to you offshore.",
      state: "missing",
    });
  }
  if (p.is_rotational && !p.back_to_back_id) {
    out.push({
      key: "back_to_back",
      label: "Back-to-back",
      why: "The person who relieves you at crew change, so hand-overs and reminders reach them.",
      state: "missing",
    });
  }
  return out;
}

/** A short line for the prompt's heading. */
export function gapsHeadline(gaps: ProfileGap[]): string {
  const expired = gaps.filter((g) => g.state === "expired").length;
  const missing = gaps.length - expired;
  const parts: string[] = [];
  if (expired) parts.push(`${expired} certificate${expired === 1 ? "" : "s"} expired`);
  if (missing) parts.push(`${missing} detail${missing === 1 ? "" : "s"} missing`);
  return parts.join(", ");
}
