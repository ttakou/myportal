import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/notify";
import { addDays, siteDate, siteMinutes } from "@/lib/visitors/daily";

/**
 * The canteen job, every 15 minutes. Three nudges, each sent once:
 *
 * - In the hour before the cutoff, people who may eat and have not booked
 *   are reminded to.
 * - Late afternoon, when tomorrow's menu is published, everyone who may
 *   eat hears it is out and when booking closes.
 * - In the evening, a person who has missed three bookings in thirty days
 *   is told, once a month, and the canteen managers get the list.
 *
 * The canteen settings JSON carries the knobs: cutoff_hour,
 * remind_before_cutoff_minutes (60), menu_out_hour (16),
 * no_show_warning_threshold (3, 0 off).
 */

interface CanteenSettings {
  cutoff_hour?: number | string | null;
  remind_before_cutoff_minutes?: number | string;
  menu_out_hour?: number | string;
  no_show_warning_threshold?: number | string;
}

async function tenantsWithCanteen(admin: SupabaseClient): Promise<{ tenantId: string; settings: CanteenSettings }[]> {
  const { data } = await admin
    .from("tenant_services")
    .select("tenant_id, settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "canteen")
    .eq("is_active", true);
  return ((data ?? []) as { tenant_id: string; settings: CanteenSettings | null }[]).map((s) => ({
    tenantId: s.tenant_id,
    settings: s.settings ?? {},
  }));
}

/** Insert the log row first; a duplicate means it already went. */
async function once(admin: SupabaseClient, tenantId: string, kind: string, date: string, profileId: string | null = null): Promise<boolean> {
  const { error } = await admin.from("canteen_notice_log").insert({ tenant_id: tenantId, kind, service_date: date, profile_id: profileId });
  return !error;
}

/** Everyone who may eat on a date: lunch-eligible staff plus entitlement holders. */
async function eaters(admin: SupabaseClient, tenantId: string, date: string): Promise<string[]> {
  const [{ data: eligible }, { data: entitled }] = await Promise.all([
    admin.from("profiles").select("id").eq("tenant_id", tenantId).eq("is_active", true).eq("lunch_eligible", true),
    admin.from("canteen_meal_entitlements").select("profile_id, daily_meals").eq("tenant_id", tenantId).lte("starts_on", date).gte("ends_on", date),
  ]);
  const ids = new Set<string>((eligible ?? []).map((p) => p.id as string));
  for (const e of entitled ?? []) if (Number(e.daily_meals) > 0) ids.add(e.profile_id as string);
  return [...ids];
}

async function bookedOn(admin: SupabaseClient, tenantId: string, date: string): Promise<Set<string>> {
  const { data } = await admin.from("canteen_bookings").select("profile_id").eq("tenant_id", tenantId).eq("service_date", date).neq("status", "cancelled");
  return new Set((data ?? []).map((b) => b.profile_id as string));
}

async function managers(admin: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data } = await admin.from("profile_roles").select("profile_id").eq("tenant_id", tenantId).in("role", ["canteen_manager", "hr_canteen"]);
  return [...new Set((data ?? []).map((r) => r.profile_id as string))];
}

export async function runCanteenLive(
  nowIso: string = new Date().toISOString(),
): Promise<{ ok: boolean; reminded: number; menuOut: number; warned: number; tenants: number; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reminded: 0, menuOut: 0, warned: 0, tenants: 0, error: "Service-role key missing." };
  const today = siteDate(nowIso);
  const tomorrow = addDays(today, 1);
  const minutes = siteMinutes(nowIso);

  let reminded = 0;
  let menuOut = 0;
  let warned = 0;
  const tenants = await tenantsWithCanteen(admin);
  for (const { tenantId, settings } of tenants) {
    const cutoff = settings.cutoff_hour === null || settings.cutoff_hour === undefined || settings.cutoff_hour === "" ? null : Number(settings.cutoff_hour);
    const remind = Number(settings.remind_before_cutoff_minutes ?? 60);
    const menuOutHour = Number(settings.menu_out_hour ?? 16);
    const threshold = Number(settings.no_show_warning_threshold ?? 3);

    // 1) Book-by reminder, in the window before the cutoff.
    if (cutoff !== null && remind > 0 && minutes >= cutoff * 60 - remind && minutes < cutoff * 60) {
      const { count: dishes } = await admin.from("canteen_dishes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("service_date", today).eq("is_active", true);
      if ((dishes ?? 0) > 0 && (await once(admin, tenantId, "book_reminder", today))) {
        const booked = await bookedOn(admin, tenantId, today);
        const targets = (await eaters(admin, tenantId, today)).filter((id) => !booked.has(id));
        if (targets.length > 0) {
          await notifyUsers({
            tenantId,
            profileIds: targets,
            category: "general",
            title: `Book your lunch by ${String(cutoff).padStart(2, "0")}:00`,
            body: "Today's menu is open and you have not booked. Booking closes at the cutoff; walk-ins depend on what is left.",
            url: "/canteen",
          });
          reminded += targets.length;
        }
      }
    }

    // 2) Tomorrow's menu is out.
    if (menuOutHour >= 0 && minutes >= menuOutHour * 60 && minutes < menuOutHour * 60 + 60) {
      const { count: dishes } = await admin.from("canteen_dishes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("service_date", tomorrow).eq("is_active", true);
      if ((dishes ?? 0) > 0 && (await once(admin, tenantId, "menu_out", tomorrow))) {
        const targets = await eaters(admin, tenantId, tomorrow);
        if (targets.length > 0) {
          await notifyUsers({
            tenantId,
            profileIds: targets,
            category: "general",
            title: "Tomorrow's menu is out",
            body: `${dishes} dish${dishes === 1 ? "" : "es"} on the menu.${cutoff !== null ? ` Book before ${String(cutoff).padStart(2, "0")}:00 tomorrow.` : ""}`,
            url: `/canteen?date=${tomorrow}`,
          });
          menuOut += targets.length;
        }
      }
    }

    // 3) Repeat no-shows, in the evening.
    if (threshold > 0 && minutes >= 18 * 60 && minutes < 19 * 60 && (await once(admin, tenantId, "no_show_sweep", today))) {
      const since = addDays(today, -30);
      const { data: missed } = await admin
        .from("canteen_lunch_history")
        .select("profile_id, service_date")
        .eq("tenant_id", tenantId)
        .eq("outcome", "missed")
        .gte("service_date", since);
      const counts = new Map<string, number>();
      for (const m of missed ?? []) counts.set(m.profile_id as string, (counts.get(m.profile_id as string) ?? 0) + 1);
      const offenders = [...counts.entries()].filter(([, n]) => n >= threshold);
      if (offenders.length > 0) {
        // Warned at most once per thirty days: the log row carries the month.
        const monthKey = today.slice(0, 7) + "-01";
        const names = new Map<string, string>();
        const { data: people } = await admin.from("profiles").select("id, full_name").in("id", offenders.map(([id]) => id));
        for (const p of people ?? []) names.set(p.id as string, (p.full_name as string) ?? "—");
        for (const [profileId, n] of offenders) {
          if (!(await once(admin, tenantId, "no_show_warning", monthKey, profileId))) continue;
          warned += 1;
          await notifyUsers({
            tenantId,
            profileIds: [profileId],
            category: "general",
            title: `${n} lunches booked and not collected in 30 days`,
            body: "Each one is a plate cooked for nobody. Cancel before the cutoff when your plans change.",
            url: "/canteen/history",
          });
        }
        await notifyUsers({
          tenantId,
          profileIds: await managers(admin, tenantId),
          category: "general",
          title: `${offenders.length} repeat no-show${offenders.length === 1 ? "" : "s"} this month`,
          body: offenders
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, n]) => `${names.get(id) ?? "—"} (${n})`)
            .join(" · "),
          url: "/canteen/forecast",
        });
      }
    }
  }
  return { ok: true, reminded, menuOut, warned, tenants: tenants.length };
}
