import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupFlight } from "@/lib/flight-api";
import { notifyProfiles } from "@/lib/eess-notify";
import { FLIGHT_STATUS_LABEL, type FlightStatus } from "@/types/trips";

/** Statuses worth pushing an alert about when a flight changes into them. */
const ALERT_STATUSES: FlightStatus[] = ["delayed", "cancelled", "diverted"];
/** Once a flight reaches one of these we stop polling it. */
const TERMINAL_STATUSES: FlightStatus[] = ["landed", "cancelled"];

export interface FlightTrackingSummary {
  scanned: number;
  updated: number;
  alerted: number;
  skipped: string;
}

/** Tenant admin profile ids (the travel desk) for a tenant. */
async function tenantAdminIds(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<string[]> {
  if (!admin) return [];
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["tenant_admin", "super_admin"]);
  return (data ?? []).map((r) => r.id as string);
}

/**
 * Poll every active trip that has a flight number, refresh its status from the
 * flight-data API, and push an alert to the traveller + travel desk when a
 * flight slips into a delayed/cancelled/diverted state. Safe to run on a cron:
 * no-ops cleanly when the flight API or service-role key isn't configured.
 */
export async function runFlightTracking(): Promise<FlightTrackingSummary> {
  const empty = { scanned: 0, updated: 0, alerted: 0 };
  const admin = createAdminClient();
  if (!admin) return { ...empty, skipped: "no service-role key" };

  const { data: trips, error } = await admin
    .from("out_of_town_trips")
    .select("id, tenant_id, requester_id, destination, flight_number, flight_status")
    .neq("status", "rejected")
    .neq("phase", "returned")
    .not("flight_number", "is", null)
    .not("flight_status", "in", "(landed,cancelled)");
  if (error) return { ...empty, skipped: error.message };

  let updated = 0;
  let alerted = 0;

  for (const trip of trips ?? []) {
    const result = await lookupFlight(trip.flight_number as string);
    if (!result.ok) continue; // missing key / no data / bad number — leave as-is
    const info = result.info;
    const prev = trip.flight_status as FlightStatus;

    const patch: Record<string, unknown> = {
      flight_status: info.status,
      flight_checked_at: new Date().toISOString(),
    };
    if (info.arrivalAt) patch.flight_arrival_at = info.arrivalAt;
    if (info.terminal) patch.terminal = info.terminal;
    await admin.from("out_of_town_trips").update(patch).eq("id", trip.id);
    updated++;

    // Alert only on a *transition* into a disruption state — never repeatedly.
    if (info.status !== prev && ALERT_STATUSES.includes(info.status)) {
      const admins = await tenantAdminIds(admin, trip.tenant_id as string);
      const recipients = new Set<string>(admins);
      if (trip.requester_id) recipients.add(trip.requester_id as string);
      await notifyProfiles({
        tenantId: trip.tenant_id as string,
        profileIds: [...recipients],
        audience: "travel",
        sourceType: "flight_update",
        sourceId: trip.id as string,
        payload: {
          title: `Flight ${FLIGHT_STATUS_LABEL[info.status]}: ${trip.flight_number}`,
          body: `${trip.destination} trip — flight is now ${FLIGHT_STATUS_LABEL[
            info.status
          ].toLowerCase()}.`,
          url: "/out-of-town",
          tag: `flight-${trip.id}`,
          severity: info.status === "cancelled" ? "critical" : "warning",
        },
      });
      alerted++;
    }

    void TERMINAL_STATUSES; // documented intent; filtering done in the query
  }

  return { scanned: trips?.length ?? 0, updated, alerted, skipped: "" };
}
