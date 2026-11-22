import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { one } from "./_shared";
import { ensureDayManifests, offshoreDefaultInstallation } from "./day-manifest-run";
import { nextCrewChangeDate } from "./manifest-plan";
import { moveDirection, moveFlagKind, MOVE_KIND_LABEL, MOVE_REASON_LABEL, type MoveKind, type MoveReason, type MoveDirection } from "./movement-change";

/**
 * Carrying out approved movement changes, on a client that may write trips
 * and manifests (the service role, or an offshore manager's session).
 *
 * On approval the manifests are fixed at once: the person comes off the
 * manifest of their scheduled date and goes on the one of the requested date
 * (made if that day had none). On the requested date itself — straight away
 * if it is today, otherwise in the nightly run — they are boarded or
 * demobilised, and the change is put on the attendance record.
 */

type Row = Record<string, any>;

const FLAG_REASON: Record<MoveReason, string> = {
  medical: "sick",
  compassionate: "compassionate",
  operational: "other",
  training_logistics: "training_logistics",
  other: "other",
};

/** People whose approved change moves them away from this day's crew change. */
export async function movedAwayOn(client: SupabaseClient, tenantId: string, date: string, direction: MoveDirection): Promise<Set<string>> {
  const { data } = await client
    .from("offshore_movement_requests")
    .select("profile_id, kind")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .eq("scheduled_date", date);
  return new Set(((data ?? []) as Row[]).filter((m) => moveDirection(m.kind as MoveKind) === direction).map((m) => m.profile_id as string));
}

/** Fix the manifests for a request just approved. */
export async function placeApprovedMove(client: SupabaseClient, tenantId: string, moveId: string, todayIso: string): Promise<void> {
  const { data: m } = await client
    .from("offshore_movement_requests")
    .select("id, profile_id, kind, scheduled_date, requested_date, installation_id, status")
    .eq("id", moveId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!m || m.status !== "approved") return;
  const direction = moveDirection(m.kind as MoveKind);

  // Off the scheduled day's open manifest (setting a first date has none).
  const { data: oldDay } = !m.scheduled_date
    ? { data: [] }
    : await client
    .from("offshore_manifests")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "day")
    .eq("scheduled_date", m.scheduled_date)
    .eq("direction", direction)
    .in("status", ["draft", "approved"]);
  const oldIds = ((oldDay ?? []) as Row[]).map((r) => r.id as string);
  if (oldIds.length) {
    await client.from("offshore_manifest_pax").delete().in("manifest_id", oldIds).eq("profile_id", m.profile_id).eq("boarded", false);
  }

  // A demobilisation that moves changes the planned end of the trip on board.
  if (direction === "in") {
    await client
      .from("offshore_trips")
      .update({ demob_date: m.requested_date })
      .eq("tenant_id", tenantId)
      .eq("profile_id", m.profile_id)
      .eq("status", "onboard");
  }

  if (m.requested_date < todayIso) return;
  // Onto the requested day's manifest: made with them on it if the day had
  // none, otherwise added.
  const defaultInstallationId = await offshoreDefaultInstallation(client, tenantId);
  await ensureDayManifests(client, tenantId, { todayIso: m.requested_date, horizonDays: 1, defaultInstallationId });
  const installationId = (m.installation_id as string | null) ?? defaultInstallationId;
  let q = client
    .from("offshore_manifests")
    .select("id, offshore_manifest_pax(profile_id)")
    .eq("tenant_id", tenantId)
    .eq("kind", "day")
    .eq("scheduled_date", m.requested_date)
    .eq("direction", direction)
    .in("status", ["draft", "approved"]);
  q = installationId ? q.eq("installation_id", installationId) : q.is("installation_id", null);
  const { data: target } = await q.limit(1).maybeSingle();
  if (!target) return;
  const onIt = ((target.offshore_manifest_pax ?? []) as Row[]).some((p) => p.profile_id === m.profile_id);
  if (onIt) return;
  const [{ data: person }, { data: staff }] = await Promise.all([
    client.from("profiles").select("full_name, email").eq("id", m.profile_id).maybeSingle(),
    client.from("offshore_staff").select("position").eq("profile_id", m.profile_id).maybeSingle(),
  ]);
  await client.from("offshore_manifest_pax").insert({
    tenant_id: tenantId,
    manifest_id: target.id,
    profile_id: m.profile_id,
    person_name: person?.full_name || person?.email || "Crew member",
    position: (staff?.position as string | null) ?? null,
  });
}

/**
 * Board or demobilise everyone whose approved change falls on or before
 * today and has not been carried out yet. Returns how many were done.
 */
export async function carryOutDueMoves(client: SupabaseClient, tenantId: string, todayIso: string): Promise<number> {
  const { data: due } = await client
    .from("offshore_movement_requests")
    .select("id, profile_id, crew_id, installation_id, kind, reason, scheduled_date, requested_date, decided_by")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .is("applied_at", null)
    .lte("requested_date", todayIso);
  let done = 0;
  for (const m of (due ?? []) as Row[]) {
    const kind = m.kind as MoveKind;
    const { data: aboard } = await client
      .from("offshore_trips")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("profile_id", m.profile_id)
      .eq("status", "onboard")
      .maybeSingle();

    if (moveDirection(kind) === "out") {
      if (!aboard) {
        const [{ data: staff }, { data: crew }] = await Promise.all([
          client
            .from("offshore_staff")
            .select("crew_id, fixed_room_id, fixed_bed, lifeboat")
            .eq("profile_id", m.profile_id)
            .maybeSingle(),
          m.crew_id
            ? client.from("offshore_crews").select("offshore_days, onshore_days, cycle_start_date, installation_id").eq("id", m.crew_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        // The hitch still ends when the rotation says.
        const end = crew?.cycle_start_date
          ? nextCrewChangeDate(
              { offshore_days: Number(crew.offshore_days), onshore_days: Number(crew.onshore_days), cycle_start_date: crew.cycle_start_date as string },
              m.requested_date,
              "in",
            )
          : null;
        const { error } = await client.from("offshore_trips").insert({
          tenant_id: tenantId,
          profile_id: m.profile_id,
          installation_id: m.installation_id ?? crew?.installation_id ?? (await offshoreDefaultInstallation(client, tenantId)),
          crew_id: m.crew_id ?? staff?.crew_id ?? null,
          category: "staff",
          trip_type: "crew_change_out",
          mobilize_date: m.requested_date,
          demob_date: end,
          status: "onboard",
          hse_cleared_at: new Date().toISOString(),
          room_id: (staff?.fixed_room_id as string | null) ?? null,
          bed_no: (staff?.fixed_bed as string | null) ?? null,
          lifeboat: (staff?.lifeboat as string | null) ?? null,
          mode: "auto",
        });
        if (error) {
          console.error(`movement change ${m.id}: boarding failed: ${error.message}`);
          continue;
        }
      }
    } else if (aboard) {
      const { error } = await client
        .from("offshore_trips")
        .update({ status: "demobilised", demob_date: m.requested_date })
        .eq("id", aboard.id);
      if (error) {
        console.error(`movement change ${m.id}: demobilising failed: ${error.message}`);
        continue;
      }
    }

    // On the attendance record, already dealt with — an early or late change
    // only; setting a first demob date is not an exception.
    const now = new Date().toISOString();
    const flagKind = moveFlagKind(kind);
    if (flagKind) await client.from("offshore_rotation_flags").insert({
      tenant_id: tenantId,
      profile_id: m.profile_id,
      installation_id: m.installation_id ?? null,
      kind: flagKind,
      reason: FLAG_REASON[m.reason as MoveReason] ?? "other",
      note: `Approved: ${MOVE_KIND_LABEL[kind]} (${MOVE_REASON_LABEL[m.reason as MoveReason] ?? m.reason}), scheduled ${m.scheduled_date}.`,
      effective_date: m.requested_date,
      created_by: m.decided_by ?? null,
      resolved_at: now,
      resolved_by: m.decided_by ?? null,
    });
    await client.from("offshore_movement_requests").update({ applied_at: now }).eq("id", m.id);
    done += 1;
  }
  return done;
}

/** One row's people, for messages: the person and whoever raised it. */
export function moveName(row: Row): string {
  return one<{ full_name?: string }>(row.person)?.full_name ?? "Staff member";
}
