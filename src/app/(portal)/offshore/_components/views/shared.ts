"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { type EmergencyRoleKind, type EmergencyTeamKind, type RosterEntry } from "@/types/offshore";

/**
 * Bits every management view leans on: the field class, the
 * transition-plus-error hook behind each Save button, the roster adapter
 * for lib/offshore/people, and the muster-team order the emergency views
 * share.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

export const field = "rounded-md border bg-background px-3 py-2 text-sm";

export const EMERGENCY_ORDER: EmergencyRoleKind[] = [
  "evac_leader",
  "evac_assistant",
  "headcount_principal",
  "headcount_assistant",
];

/** Unlimited-membership emergency teams, in display order. */
export const EMERGENCY_TEAMS: EmergencyTeamKind[] = ["hlo", "fire_team"];

/** Adapt roster rows for lib/offshore/people. */
export function rosterInfo(roster: RosterEntry[]) {
  return roster.map((m) => ({
    profile_id: m.profile_id,
    name: m.full_name || m.email,
    crew_id: m.crew_id,
    crew_name: m.crew_name,
    company: m.company,
    travel_eligible: m.travel_eligible,
  }));
}

export function useRun() {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  };
  return { pending, error, run };
}
