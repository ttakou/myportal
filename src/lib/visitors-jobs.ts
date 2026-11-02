import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModuleSettingsForTenant } from "@/lib/module-settings";
import { notifyUsers } from "@/lib/notify";
import { holdersOfVerb } from "@/lib/verb-holders";
import {
  addDays,
  AUTO_CLOSED_NOTE,
  endOfSiteDay,
  expectedOn,
  leftOpen,
  neverCame,
  overstays,
  passesEndingOn,
  siteDate,
  type VisitLite,
} from "@/lib/visitors/daily";

/**
 * The visitor jobs.
 *
 * Evening (17:00 site time): close yesterday's pre-registrations that
 * never came as no-shows; close entries left open from an earlier day,
 * whose exit nobody recorded; send tomorrow's expected list — the whole
 * list to reception, each host their own; warn about long-stay passes that
 * end in a few days; and tell security which badges did not come back today.
 *
 * Every 15 minutes: past the tenant's cutoff, tell security and the host
 * about anyone still on site, once a day per visit.
 */

async function tenantsWithVisitors(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from("tenant_services")
    .select("tenant_id, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "visitors")
    .eq("is_active", true);
  return ((data ?? []) as { tenant_id: string }[]).map((s) => s.tenant_id);
}

interface VisitRow extends VisitLite {
  full_name: string;
  company: string | null;
  host_id: string | null;
}

export async function runVisitorsEvening(
  nowIso: string = new Date().toISOString(),
): Promise<{ ok: boolean; noShows: number; closed: number; expected: number; expiring: number; badgesMissing: number; tenants: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, noShows: 0, closed: 0, expected: 0, expiring: 0, badgesMissing: 0, tenants: 0, error: "Service-role key missing." };
  const today = siteDate(nowIso);
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);

  let noShows = 0;
  let closed = 0;
  let expected = 0;
  let expiring = 0;
  let badgesMissing = 0;
  const tenants = await tenantsWithVisitors(admin);
  for (const tenantId of tenants) {
    const cfg = await getModuleSettingsForTenant(admin, tenantId, "visitors");
    const { data } = await admin
      .from("visitors")
      .select("id, status, visit_date, visit_until, full_name, company, host_id")
      .eq("tenant_id", tenantId)
      .eq("status", "pre_registered")
      .lte("visit_date", tomorrow);
    const rows = (data ?? []) as VisitRow[];

    // Long-stay passes ending soon: the host and security get a few days' notice.
    const noticeDays = Number(cfg.pass_expiry_notice_days ?? 3);
    if (noticeDays > 0) {
      const endDate = addDays(today, noticeDays);
      const { data: passes } = await admin
        .from("visitors")
        .select("id, status, visit_date, visit_until, full_name, company, host_id")
        .eq("tenant_id", tenantId)
        .eq("visit_until", endDate);
      const ending = passesEndingOn((passes ?? []) as VisitRow[], endDate);
      if (ending.length > 0) {
        expiring += ending.length;
        const security = await holdersOfVerb(admin, tenantId, "visitors", ["operate"]);
        for (const v of ending) {
          const who = `${v.full_name}${v.company ? ` (${v.company})` : ""}`;
          await notifyUsers({
            tenantId,
            profileIds: [v.host_id, ...security],
            category: "general",
            title: `Pass ends ${endDate}: ${who}`,
            body: `The long-stay pass expires in ${noticeDays} day${noticeDays === 1 ? "" : "s"}. Extend it with a new registration, or make sure they leave by then.`,
            url: `/visitors?date=${endDate}`,
          });
        }
      }
    }

    // Badges that did not come back today.
    const { data: missing } = await admin
      .from("visitors")
      .select("full_name, company, badge_no")
      .eq("tenant_id", tenantId)
      .eq("badge_returned", false)
      .gte("badge_returned_at", today + "T00:00:00Z");
    if ((missing ?? []).length > 0) {
      badgesMissing += (missing ?? []).length;
      const security = await holdersOfVerb(admin, tenantId, "visitors", ["operate"]);
      await notifyUsers({
        tenantId,
        profileIds: security,
        category: "general",
        title: `${(missing ?? []).length} badge${(missing ?? []).length === 1 ? "" : "s"} not returned today`,
        body: (missing ?? []).map((m) => `${m.badge_no ?? "?"} — ${m.full_name}${m.company ? ` (${m.company})` : ""}`).join(" · "),
        url: "/visitors",
      });
    }

    if (cfg.auto_close_open_visits !== false) closed += await closeLeftOpen(admin, tenantId, today);

    if (cfg.auto_no_show !== false) {
      const gone = neverCame(rows, today);
      // A pass that was never entered has no gate log; one that was is not
      // pre-registered any more, so the status test above already excludes it.
      if (gone.length > 0) {
        const { error } = await admin
          .from("visitors")
          .update({ status: "no_show" })
          .in(
            "id",
            gone.map((v) => v.id),
          )
          .eq("status", "pre_registered");
        if (!error) noShows += gone.length;
      }
    }

    if (cfg.expected_list_evening !== false) {
      const due = expectedOn(rows, tomorrow);
      expected += due.length;
      if (due.length > 0) {
        const line = (v: VisitRow) => `${v.full_name}${v.company ? ` (${v.company})` : ""}`;
        const reception = await holdersOfVerb(admin, tenantId, "visitors", ["operate"]);
        await notifyUsers({
          tenantId,
          profileIds: reception,
          category: "general",
          title: `${due.length} visitor${due.length === 1 ? "" : "s"} expected tomorrow`,
          body: due
            .slice(0, 12)
            .map(line)
            .join(" · ")
            .concat(due.length > 12 ? ` · and ${due.length - 12} more` : ""),
          url: `/visitors?date=${tomorrow}`,
        });
        const byHost = new Map<string, VisitRow[]>();
        for (const v of due) if (v.host_id) byHost.set(v.host_id, [...(byHost.get(v.host_id) ?? []), v]);
        for (const [hostId, list] of byHost) {
          await notifyUsers({
            tenantId,
            profileIds: [hostId],
            category: "general",
            title: list.length === 1 ? `Your visitor tomorrow: ${line(list[0])}` : `${list.length} visitors with you tomorrow`,
            body: list.length === 1 ? "Reception will tell you when they arrive." : list.map(line).join(" · "),
            url: `/visitors?date=${tomorrow}`,
          });
        }
      }
    }
  }
  return { ok: true, noShows, closed, expected, expiring, badgesMissing, tenants: tenants.length };
}

/**
 * Close what is still open from an earlier day.
 *
 * A visit nobody checked out stayed "on site" for good: it was counted in the
 * muster, re-announced by the overstay alert every evening and carried as an
 * anomaly in every monthly register. The exit is set to the end of the day
 * they came, with a note saying it was not recorded, so the register still
 * shows the gap and dwell times leave it out. Security is told who.
 */
async function closeLeftOpen(admin: SupabaseClient, tenantId: string, today: string): Promise<number> {
  type Open = { id: string; visitor_id?: string; check_in_at: string | null; full_name?: string; company?: string | null };
  const [single, entries] = await Promise.all([
    admin
      .from("visitors")
      .select("id, check_in_at, full_name, company")
      .eq("tenant_id", tenantId)
      .is("visit_until", null)
      .is("check_out_at", null)
      .not("check_in_at", "is", null)
      .lt("check_in_at", today + "T00:00:00Z"),
    admin
      .from("visitor_checkins")
      .select("id, visitor_id, check_in_at, visitor:visitors!inner(full_name, company)")
      .eq("tenant_id", tenantId)
      .is("check_out_at", null)
      .lt("check_in_at", today + "T00:00:00Z"),
  ]);
  const names: string[] = [];

  for (const v of leftOpen((single.data ?? []) as Open[], today)) {
    const { error } = await admin
      .from("visitors")
      .update({ status: "checked_out", check_out_at: endOfSiteDay(v.check_in_at!), check_out_comment: AUTO_CLOSED_NOTE, overstay_alerted_at: null })
      .eq("id", v.id)
      .is("check_out_at", null);
    if (!error) names.push(`${v.full_name}${v.company ? ` (${v.company})` : ""}`);
  }

  const passRows = ((entries.data ?? []) as Record<string, unknown>[]).map((e) => {
    const v = (Array.isArray(e.visitor) ? e.visitor[0] : e.visitor) as { full_name?: string; company?: string | null } | null;
    return { id: e.id as string, visitor_id: e.visitor_id as string, check_in_at: (e.check_in_at as string) ?? null, full_name: v?.full_name, company: v?.company ?? null };
  });
  for (const e of leftOpen(passRows, today)) {
    const out = endOfSiteDay(e.check_in_at!);
    const { error } = await admin
      .from("visitor_checkins")
      .update({ check_out_at: out, check_out_comment: AUTO_CLOSED_NOTE })
      .eq("id", e.id)
      .is("check_out_at", null);
    if (error) continue;
    // Mirror onto the pass, as a gate check-out does; the pass stays valid.
    await admin
      .from("visitors")
      .update({ status: "checked_out", check_out_at: out, check_out_comment: AUTO_CLOSED_NOTE, overstay_alerted_at: null })
      .eq("id", e.visitor_id)
      .eq("status", "checked_in");
    names.push(`${e.full_name ?? "—"}${e.company ? ` (${e.company})` : ""}`);
  }

  if (names.length > 0) {
    const security = await holdersOfVerb(admin, tenantId, "visitors", ["operate"]);
    await notifyUsers({
      tenantId,
      profileIds: security,
      category: "general",
      title: `${names.length} visit${names.length === 1 ? "" : "s"} closed with no exit recorded`,
      body: `Still checked in from an earlier day, so closed as "exit not recorded": ${names.slice(0, 12).join(" · ")}${names.length > 12 ? ` · and ${names.length - 12} more` : ""}. Please check visitors out at the gate when they leave.`,
      url: "/visitors/register",
    });
  }
  return names.length;
}

interface OnSiteRow {
  id: string;
  full_name: string;
  company: string | null;
  host_id: string | null;
  check_in_at: string | null;
  overstay_alerted_at: string | null;
}

export async function runVisitorsLive(
  nowIso: string = new Date().toISOString(),
): Promise<{ ok: boolean; alerted: number; tenants: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, alerted: 0, tenants: 0, error: "Service-role key missing." };
  const today = siteDate(nowIso);

  let alerted = 0;
  const tenants = await tenantsWithVisitors(admin);
  for (const tenantId of tenants) {
    const cfg = await getModuleSettingsForTenant(admin, tenantId, "visitors");
    const cutoff = String(cfg.overstay_alert_time ?? "").trim();
    if (!cutoff) continue;

    // Single-day visitors checked in today, plus passes with an open entry.
    const [single, open] = await Promise.all([
      admin
        .from("visitors")
        .select("id, full_name, company, host_id, check_in_at, overstay_alerted_at")
        .eq("tenant_id", tenantId)
        .eq("status", "checked_in")
        .is("visit_until", null)
        .lte("visit_date", today),
      admin
        .from("visitor_checkins")
        .select("visitor_id, check_in_at, visitor:visitors!inner(id, full_name, company, host_id, overstay_alerted_at, tenant_id)")
        .eq("visitors.tenant_id", tenantId)
        .is("check_out_at", null),
    ]);
    const onSite: OnSiteRow[] = [...((single.data ?? []) as OnSiteRow[])];
    for (const e of (open.data ?? []) as Record<string, unknown>[]) {
      const v = (Array.isArray(e.visitor) ? e.visitor[0] : e.visitor) as OnSiteRow | null;
      if (v) onSite.push({ ...v, check_in_at: (e.check_in_at as string) ?? null });
    }

    const late = overstays(onSite, nowIso, cutoff);
    if (late.length === 0) continue;
    const security = await holdersOfVerb(admin, tenantId, "visitors", ["operate"]);
    for (const v of late) {
      const { error } = await admin.from("visitors").update({ overstay_alerted_at: nowIso }).eq("id", v.id);
      if (error) continue;
      alerted += 1;
      const who = `${v.full_name}${v.company ? ` (${v.company})` : ""}`;
      await notifyUsers({
        tenantId,
        profileIds: [...security, v.host_id],
        category: "general",
        title: `Still on site after ${cutoff}: ${who}`,
        body: `Checked in ${v.check_in_at ? `at ${new Date(v.check_in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Douala" })}` : "earlier"} and not checked out. Confirm they have left, or check them out.`,
        url: "/visitors",
      });
    }
  }
  return { ok: true, alerted, tenants: tenants.length };
}
