import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getModuleSettingsForTenant } from "@/lib/module-settings";
import { notifyUsers } from "@/lib/notify";
import { escalationNote, staleApprovals } from "@/lib/transport/approvals";

/**
 * Approval fallback: a ride request the line manager has not decided
 * within the tenant's escalation delay goes to the dispatch desk as a
 * pending request, with the reason on its thread, and both the requester
 * and the desk hear about it. Runs from the daily transport job for every
 * tenant, and again when the desk opens the module, so a stale request
 * never outlives the delay by more than a page load.
 */
export async function escalateStaleApprovals(
  onlyTenant?: string,
  nowIso: string = new Date().toISOString(),
): Promise<{ ok: boolean; escalated: number; tenants: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, escalated: 0, tenants: 0, error: "Service-role key missing." };

  let q = admin
    .from("tenant_services")
    .select("tenant_id, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "transportation")
    .eq("is_active", true);
  if (onlyTenant) q = q.eq("tenant_id", onlyTenant);
  const { data: services } = await q;

  let escalated = 0;
  let tenants = 0;
  for (const svc of (services ?? []) as { tenant_id: string }[]) {
    tenants += 1;
    escalated += await escalateTenant(admin, svc.tenant_id, nowIso);
  }
  return { ok: true, escalated, tenants };
}

/** The same, for the signed-in user's own tenant (the desk opening the module). */
export async function escalateStaleApprovalsHere(): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (data?.id) await escalateStaleApprovals(data.id as string);
}

async function escalateTenant(admin: SupabaseClient, tenantId: string, nowIso: string): Promise<number> {
  const cfg = await getModuleSettingsForTenant(admin, tenantId, "transportation");
  const hours = Number(cfg.approval_escalation_hours ?? 24);
  if (!(hours > 0)) return 0;

  const { data: waiting } = await admin
    .from("transport_requests")
    .select("id, status, created_at, requester_id, pickup, dropoff, depart_at")
    .eq("tenant_id", tenantId)
    .eq("status", "awaiting_approval");
  const stale = staleApprovals((waiting ?? []) as WaitingRow[], nowIso, hours);
  if (stale.length === 0) return 0;

  const note = escalationNote(hours);
  const { data: desk } = await admin
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["tenant_admin", "super_admin"]);
  const deskIds = (desk ?? []).map((p) => p.id as string);

  let n = 0;
  for (const r of stale) {
    const { error } = await admin
      .from("transport_requests")
      .update({ status: "pending" })
      .eq("id", r.id)
      .eq("status", "awaiting_approval");
    if (error) {
      console.error(`escalate ${r.id}: ${error.message}`);
      continue;
    }
    n += 1;
    await admin.from("transport_task_updates").insert({
      tenant_id: tenantId,
      request_id: r.id,
      author_id: null,
      note,
      new_status: "pending",
    });
    const route = `${r.pickup} → ${r.dropoff}`;
    const when = new Date(r.depart_at).toLocaleString("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Douala",
    });
    await notifyUsers({
      tenantId,
      profileIds: [r.requester_id],
      category: "transport",
      title: "Ride request passed to the dispatch desk",
      body: `${route} · ${when}. ${note}`,
      url: "/transportation?view=requests",
    });
    await notifyUsers({
      tenantId,
      profileIds: deskIds,
      category: "transport",
      title: "Unanswered approval escalated",
      body: `${route} · ${when}. ${note} Assign a driver on the dispatch board.`,
      url: "/transportation?view=dispatch",
    });
  }
  return n;
}

interface WaitingRow {
  id: string;
  status: string;
  created_at: string;
  requester_id: string | null;
  pickup: string;
  dropoff: string;
  depart_at: string;
}
