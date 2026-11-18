import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "./_shared";
import { getOffshoreDefaultInstallation } from "./crews";
import {
  pobOutlook,
  visitStay,
  type InstallationOutlook,
  type OutlookCrew,
  type OutlookInstallation,
  type OutlookStay,
} from "./pob-outlook";

/** Trip states that mean somebody is going (or went); "requested" is pending. */
const TRIP_CONFIRMED = ["hse_cleared", "manifested", "onboard", "demobilised"];
const VISIT_CONFIRMED = ["approved", "onboard", "returned"];

/**
 * Everything the outlook reads, for a date range: the installations and their
 * POB limits, each crew's cycle and rotational members, and the trips and
 * visits that overlap the range. RLS-scoped (offshore managers read it all).
 */
export async function getPobOutlook(from: string, to: string): Promise<InstallationOutlook[]> {
  const supabase = createClient();
  const [{ data: insts }, { data: crews }, { data: staff }, { data: trips }, { data: visits }, fallback] = await Promise.all([
    supabase.from("offshore_installations").select("id, name, pob_capacity").eq("is_active", true).order("name"),
    supabase.from("offshore_crews").select("id, name, installation_id, offshore_days, onshore_days, cycle_start_date").eq("is_active", true),
    supabase.from("offshore_staff").select("profile_id, crew_id, is_rotational, profile:profiles!offshore_staff_profile_id_fkey(is_active)"),
    supabase
      .from("offshore_trips")
      .select("id, profile_id, installation_id, mobilize_date, demob_date, status, requester_id")
      .in("status", [...TRIP_CONFIRMED, "requested"])
      .lte("mobilize_date", to)
      .or(`demob_date.is.null,demob_date.gte.${from}`),
    supabase
      .from("offshore_visit_requests")
      .select("id, installation_id, depart_date, return_date, status")
      .in("status", [...VISIT_CONFIRMED, "requested"])
      .lte("depart_date", to)
      .or(`return_date.is.null,return_date.gte.${from}`),
    getOffshoreDefaultInstallation(),
  ]);

  const installations: OutlookInstallation[] = ((insts ?? []) as Record<string, unknown>[]).map((i) => ({
    id: String(i.id),
    name: String(i.name),
    capacity: Number(i.pob_capacity ?? 0),
  }));

  // Rotational members, by crew. Somebody on a rotation is placed by it, so
  // their crew-change trips are not counted again; a trip they requested
  // themselves (an extra trip on their break) still is.
  const membersByCrew = new Map<string, string[]>();
  const rotational = new Set<string>();
  for (const s of (staff ?? []) as Record<string, unknown>[]) {
    const active = one<{ is_active?: boolean }>((s.profile as never) ?? null)?.is_active !== false;
    if (!s.crew_id || s.is_rotational === false || !active) continue;
    const list = membersByCrew.get(String(s.crew_id)) ?? [];
    list.push(String(s.profile_id));
    membersByCrew.set(String(s.crew_id), list);
  }
  const outlookCrews: OutlookCrew[] = ((crews ?? []) as Record<string, unknown>[])
    .filter((c) => c.cycle_start_date)
    .map((c) => {
      const members = membersByCrew.get(String(c.id)) ?? [];
      for (const m of members) rotational.add(m);
      return {
        id: String(c.id),
        name: String(c.name),
        installationId: (c.installation_id as string | null) ?? null,
        offshore_days: Number(c.offshore_days),
        onshore_days: Number(c.onshore_days),
        cycle_start_date: String(c.cycle_start_date),
        members,
      };
    });

  const stays: OutlookStay[] = [];
  for (const t of (trips ?? []) as Record<string, unknown>[]) {
    const pid = (t.profile_id as string | null) ?? null;
    const requested = t.requester_id != null;
    if (pid && rotational.has(pid) && !requested) continue;
    stays.push({
      person: pid ? `p:${pid}` : `t:${t.id}`,
      installationId: (t.installation_id as string | null) ?? null,
      from: String(t.mobilize_date),
      to: (t.demob_date as string | null) ?? null,
      pending: t.status === "requested",
    });
  }
  for (const v of (visits ?? []) as Record<string, unknown>[]) {
    const s = visitStay(String(v.depart_date), (v.return_date as string | null) ?? null);
    stays.push({
      person: `v:${v.id}`,
      installationId: (v.installation_id as string | null) ?? null,
      from: s.from,
      to: s.to,
      pending: v.status === "requested",
    });
  }

  return pobOutlook({
    from,
    to,
    installations,
    crews: outlookCrews,
    stays,
    defaultInstallationId: fallback?.id ?? null,
  });
}
