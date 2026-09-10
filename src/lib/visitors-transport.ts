import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModuleSettings } from "@/lib/module-settings";
import { notifyUsers } from "@/lib/notify";
import { seedTaskChecklist } from "@/lib/task-checklist";
import { deskIdsFor } from "@/lib/transport-desk";
import { canonicalPlace } from "@/lib/transport/places";
import { localInputToIso } from "@/lib/transport/day-plan";

/**
 * The airport ride a visitor needs, raised on the transport board straight
 * from the visitor form. The registrar is the requester (the insert policy
 * wants that), the desk is told, and the visitor row keeps the request id
 * so reception sees the driver on the board.
 */
export async function hasTransportationModule(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("tenant_services")
    .select("tenant_id, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "transportation")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function createVisitorRide(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    kind: "pickup" | "dropoff";
    /** datetime-local on the site clock: flight arrival, or the time to leave for the airport. */
    when: string;
    visitorName: string;
    company: string | null;
    flight: string | null;
    passengers: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const at = localInputToIso(input.when);
  if (!at) return { ok: false, error: `The ${input.kind === "pickup" ? "arrival" : "departure"} time is not a valid date and time.` };
  const cfg = await getModuleSettings("visitors");
  const { data: places } = await supabase.from("transport_places").select("id, name");
  const list = (places ?? []) as { id: string; name: string }[];
  const airport = canonicalPlace(String(cfg.airport_place ?? "Douala airport"), list);
  const site = canonicalPlace(String(cfg.site_place ?? "Base main gate"), list);
  const who = `${input.visitorName}${input.company ? ` (${input.company})` : ""}`;
  const purpose = input.kind === "pickup" ? `Airport pickup: ${who}${input.flight ? ` · flight ${input.flight}` : ""}` : `Airport drop-off: ${who}${input.flight ? ` · flight ${input.flight}` : ""}`;

  const { data, error } = await supabase
    .from("transport_requests")
    .insert({
      tenant_id: input.tenantId,
      pickup: input.kind === "pickup" ? airport : site,
      dropoff: input.kind === "pickup" ? site : airport,
      depart_at: at,
      passengers: Math.max(1, input.passengers),
      purpose,
      task_type: input.kind === "pickup" ? "airport_pickup" : "airport_dropoff",
      notes: input.flight ? `Flight ${input.flight}. Visitor: ${who}.` : `Visitor: ${who}.`,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not raise the airport ride." };
  await seedTaskChecklist(supabase, input.tenantId, data.id as string, input.kind === "pickup" ? "airport_pickup" : "airport_dropoff");

  const admin = createAdminClient();
  await notifyUsers({
    tenantId: input.tenantId,
    profileIds: await deskIdsFor(admin ?? supabase, input.tenantId),
    category: "transport",
    title: input.kind === "pickup" ? `Airport pickup for a visitor: ${who}` : `Airport drop-off for a visitor: ${who}`,
    body: `${purpose} · ${new Date(at).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" })}. Assign a driver on the dispatch board.`,
    url: "/transportation?view=dispatch",
  });
  return { ok: true, id: data.id as string };
}

/** Withdraw a visitor's rides that have not started, when the visit is cancelled. */
export async function cancelVisitorRides(supabase: SupabaseClient, ids: (string | null)[]): Promise<void> {
  const live = ids.filter((x): x is string => Boolean(x));
  if (live.length === 0) return;
  await supabase.from("transport_requests").update({ status: "cancelled" }).in("id", live).in("status", ["awaiting_approval", "pending", "assigned"]);
}
