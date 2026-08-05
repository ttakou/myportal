/**
 * The people who may go offshore.
 *
 * Going offshore is not restricted to the rotation. Contractors, specialists,
 * inspectors and one-off travellers join installations constantly, and most of
 * them hold no offshore-staff roster row — production currently has 50 people
 * on board who do not. Gating the pickers on that roster made those people
 * unreachable: they could not be boarded, bedded or manifested at all.
 *
 * So the directory of active employees is the base list, and the roster only
 * ENRICHES it — crew, company, and the explicit travel bar. The one thing that
 * removes somebody is `travel_eligible = false`, which is a deliberate "must
 * not travel" set by a manager, not an accident of never being rostered.
 */

/** An active tenant profile, from getAssignableEmployees(). */
export interface DirectoryPerson {
  id: string;
  name: string;
  crew_id: string | null;
  crew_name: string | null;
}

/** The offshore-staff row for that person, when there is one. */
export interface RosterInfo {
  profile_id: string;
  name: string;
  crew_id: string | null;
  crew_name: string | null;
  company?: string | null;
  travel_eligible: boolean;
}

export interface OffshorePerson {
  profile_id: string;
  /** Display name, with company appended when known. */
  name: string;
  crew_id: string | null;
  crew_name: string | null;
  /** False only when a roster row explicitly bars them from travelling. */
  travel_eligible: boolean;
  /** True when they hold an offshore-staff roster row. */
  rostered: boolean;
}

/**
 * Everyone selectable for an offshore movement: the whole active directory,
 * plus any roster member the directory missed (an inactive profile that is
 * still on the roster), minus anyone explicitly barred from travelling.
 *
 * Sorted by name so the pickers read consistently.
 */
export function offshorePeople(
  directory: readonly DirectoryPerson[],
  roster: readonly RosterInfo[],
): OffshorePerson[] {
  const byProfile = new Map<string, RosterInfo>();
  for (const r of roster) byProfile.set(r.profile_id, r);

  const out = new Map<string, OffshorePerson>();

  for (const d of directory) {
    const r = byProfile.get(d.id);
    out.set(d.id, {
      profile_id: d.id,
      name: r?.company ? `${d.name} · ${r.company}` : d.name,
      // The roster is authoritative on crew; the directory derives it from the
      // same row, but a roster passed alone must still work.
      crew_id: r?.crew_id ?? d.crew_id,
      crew_name: r?.crew_name ?? d.crew_name,
      travel_eligible: r ? r.travel_eligible : true,
      rostered: Boolean(r),
    });
  }

  // Rostered people the directory did not return — e.g. deactivated profiles
  // who are nonetheless still on board and need demobilising.
  for (const r of roster) {
    if (out.has(r.profile_id)) continue;
    out.set(r.profile_id, {
      profile_id: r.profile_id,
      name: r.company ? `${r.name} · ${r.company}` : r.name,
      crew_id: r.crew_id,
      crew_name: r.crew_name,
      travel_eligible: r.travel_eligible,
      rostered: true,
    });
  }

  return [...out.values()]
    .filter((p) => p.travel_eligible)
    .sort((a, b) => a.name.localeCompare(b.name));
}
