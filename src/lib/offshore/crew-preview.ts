/**
 * Read-only answers to "who would be on this manifest, and for what date".
 *
 * Both crew-change buttons write immediately — they create the manifest and its
 * passenger list. There was no way to check the list first, so the only way to
 * see who a crew change would carry was to generate one and delete it. These
 * mirror what the action would do, without doing it.
 */

import { DAY_MS, type RotationCycle } from "./rotation-math";

/** One person as they would appear on the crew's manifest. */
export interface CrewManifestPreviewMember {
  profile_id: string;
  name: string;
  position: string | null;
  company: string | null;
  /** Aboard right now — so a joining run would be a no-op for them. */
  onboard: boolean;
  room_label: string | null;
  /** Certificates expired or missing: they should not be on a flight. */
  travel_eligible: boolean;
}

export interface CrewManifestPreview {
  members: CrewManifestPreviewMember[];
  onboardCount: number;
  ashoreCount: number;
  /** Members who cannot travel — the number worth acting on before boarding. */
  blockedCount: number;
}

/**
 * The crew's whole roster, which is exactly what a generated crew manifest
 * carries: `generateCrewManifest` selects on crew_id alone and does not filter
 * by direction or current status. Showing anything narrower here would preview
 * a manifest the button does not produce.
 */
export function crewManifestPreview(input: {
  crewId: string;
  roster: {
    profile_id: string;
    full_name: string | null;
    email: string;
    crew_id: string | null;
    position: string | null;
    company: string | null;
    travel_eligible: boolean;
  }[];
  onboard: { profile_id: string | null; room_label: string | null }[];
}): CrewManifestPreview {
  const aboard = new Map<string, string | null>();
  for (const p of input.onboard) {
    if (p.profile_id) aboard.set(p.profile_id, p.room_label);
  }

  const members = input.roster
    .filter((m) => m.crew_id === input.crewId)
    .map((m) => ({
      profile_id: m.profile_id,
      name: m.full_name || m.email,
      position: m.position,
      company: m.company,
      onboard: aboard.has(m.profile_id),
      room_label: aboard.get(m.profile_id) ?? null,
      travel_eligible: m.travel_eligible,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    members,
    onboardCount: members.filter((m) => m.onboard).length,
    ashoreCount: members.filter((m) => !m.onboard).length,
    blockedCount: members.filter((m) => !m.travel_eligible).length,
  };
}

/**
 * The date `generateNextCrewChange` would stamp on the manifest.
 *
 * Same arithmetic as the action, so the preview cannot drift from it: find the
 * next cycle boundary at or after today, and for a returning run step back by
 * the onshore leg. Returns null when the crew has no cycle to compute from.
 */
export function nextCrewChangeDate(input: {
  todayIso: string;
  direction: "out" | "in";
  cycle: RotationCycle | null | undefined;
}): string | null {
  const { todayIso, direction, cycle } = input;
  if (!cycle?.cycle_start_date) return null;
  const period = cycle.offshore_days + cycle.onshore_days;
  if (period <= 0) return null;

  const start = new Date(cycle.cycle_start_date + "T00:00:00Z").getTime();
  const now = new Date(todayIso + "T00:00:00Z").getTime();
  let base = start;
  if (now > start) base = start + Math.ceil((now - start) / (period * DAY_MS)) * period * DAY_MS;
  const target = direction === "in" ? base - cycle.onshore_days * DAY_MS : base;
  return new Date(target).toISOString().slice(0, 10);
}
