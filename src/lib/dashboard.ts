import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { OFFSHORE_STATUS_LABEL, type OffshoreStatus } from "@/types/offshore";
import { isWorkingDay } from "@/lib/canteen-entitlements";
import { one } from "@/lib/supabase/row-helpers";

const todayStr = () => new Date().toISOString().slice(0, 10);

export interface DashboardOffshore {
  isStaff: boolean;
  station: string | null; // lifeboat / muster station
  crew: string | null;
  room: string | null;
  bed: string | null;
  trip: {
    installation: string | null;
    mobilize: string;
    demob: string | null;
    statusLabel: string;
    active: boolean;
  } | null;
}

export interface DashboardCount {
  label: string;
  href: string;
  count: number;
}

export interface DashboardQuickLink {
  label: string;
  href: string;
}

export interface DashboardData {
  name: string;
  offshore: DashboardOffshore | null;
  approvals: DashboardCount[];
  myRequests: DashboardCount[];
  quickLinks: DashboardQuickLink[];
  /** Whether the canteen menu is relevant to this user today (entitled to dine). */
  canteenEntitledToday: boolean;
}

/** A personalized snapshot for the signed-in user, tuned to their profile/role. */
export async function getMyDashboard(): Promise<DashboardData | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const access = await getAccess();
  const today = todayStr();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const name = (profile?.full_name as string) ?? "";

  // Small helper: best-effort exact count, never throws.
  const countOf = async (
    build: () => PromiseLike<{ count: number | null }>,
  ): Promise<number> => {
    try {
      const { count } = await build();
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  // --- Offshore personalization ---------------------------------------------
  const [{ data: staff }, { data: trips }, isDriver] = await Promise.all([
    supabase
      .from("offshore_staff")
      .select(
        "fixed_bed, lifeboat, crew:offshore_crews(name)," +
          " room:offshore_rooms(room_number, block, lifeboat)",
      )
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("offshore_trips")
      .select("mobilize_date, demob_date, status, bed_no, installation:offshore_installations(name)")
      .eq("profile_id", user.id)
      .neq("status", "cancelled")
      .order("mobilize_date", { ascending: true }),
    countOf(() =>
      supabase
        .from("transport_drivers")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", user.id),
    ).then((n) => n > 0),
  ]);

  let offshore: DashboardOffshore | null = null;
  const tripRows = (trips ?? []) as Record<string, any>[];
  const s = (staff ?? null) as Record<string, any> | null;
  if (s || tripRows.length > 0) {
    const room = one<{ room_number?: string; block?: string; lifeboat?: string }>(s?.room);
    // Current/next trip: first one still running or upcoming, else the latest.
    const upcoming =
      tripRows.find((t) => ((t.demob_date as string) ?? (t.mobilize_date as string)) >= today) ??
      tripRows[tripRows.length - 1] ??
      null;
    offshore = {
      isStaff: Boolean(s),
      station: (room?.lifeboat as string | null) ?? (s?.lifeboat as string | null) ?? null,
      crew: one<{ name?: string }>(s?.crew)?.name ?? null,
      room: room ? [room.block, room.room_number].filter(Boolean).join(" ") || null : null,
      bed: (upcoming?.bed_no as string | null) ?? (s?.fixed_bed as string | null) ?? null,
      trip: upcoming
        ? {
            installation: one<{ name?: string }>(upcoming.installation)?.name ?? null,
            mobilize: upcoming.mobilize_date as string,
            demob: (upcoming.demob_date as string | null) ?? null,
            statusLabel: OFFSHORE_STATUS_LABEL[upcoming.status as OffshoreStatus] ?? upcoming.status,
            active:
              (upcoming.mobilize_date as string) <= today &&
              ((upcoming.demob_date as string | null) ?? "9999") >= today,
          }
        : null,
    };
  }

  // --- Approvals awaiting me (role-gated; counts are RLS-scoped) -------------
  const approvals: DashboardCount[] = [];
  if (access.isAdmin || access.isSafetyAdmin || access.isOim) {
    const visits = await countOf(() =>
      supabase
        .from("offshore_visit_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "requested"),
    );
    if (visits > 0)
      approvals.push({ label: "Offshore visits to approve", href: "/offshore", count: visits });
  }
  {
    // Out-of-town: RLS already limits rows to a manager's reports (or admins).
    const travel = await countOf(() =>
      supabase
        .from("out_of_town_trips")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted"),
    );
    if (travel > 0)
      approvals.push({ label: "Trips to approve", href: "/out-of-town", count: travel });
  }

  // --- My open requests (everyone) ------------------------------------------
  const myRequests: DashboardCount[] = [];

  // Safety first: SOS / incidents I raised that aren't resolved yet.
  const myIncidents = await countOf(() =>
    supabase
      .from("eess_incidents")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", user.id)
      .neq("status", "resolved"),
  );
  if (myIncidents > 0)
    myRequests.push({
      label: "My active SOS / incidents",
      href: "/emergency",
      count: myIncidents,
    });

  const myTrips = await countOf(() =>
    supabase
      .from("offshore_trips")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .in("status", ["requested", "hse_cleared", "manifested"]),
  );
  if (myTrips > 0)
    myRequests.push({ label: "My offshore trips in progress", href: "/offshore", count: myTrips });

  const myVisits = await countOf(() =>
    supabase
      .from("offshore_visit_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", user.id)
      .in("status", ["requested", "approved", "onboard"]),
  );
  if (myVisits > 0)
    myRequests.push({ label: "My visitor requests", href: "/offshore", count: myVisits });

  const myTravel = await countOf(() =>
    supabase
      .from("out_of_town_trips")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", user.id)
      .in("status", ["submitted", "manager_approved", "finance_approved"]),
  );
  if (myTravel > 0)
    myRequests.push({ label: "My trips in progress", href: "/out-of-town", count: myTravel });

  // Transport / transfer requests I raised that are still open.
  const myTransfers = await countOf(() =>
    supabase
      .from("transport_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", user.id)
      .in("status", ["pending", "assigned", "in_progress"]),
  );
  if (myTransfers > 0)
    myRequests.push({
      label: "My transport requests",
      href: "/transportation",
      count: myTransfers,
    });

  // --- Canteen: only relevant if the user can actually dine today -----------
  // Canteen staff/managers/admins keep the entry point; everyone else needs an
  // entitlement grant covering today (and it must be a working day).
  const canteenGrantsToday = await countOf(() =>
    supabase
      .from("canteen_meal_entitlements")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .lte("starts_on", today)
      .gte("ends_on", today),
  );
  const canteenEntitledToday =
    access.isAdmin ||
    access.isCanteenManager ||
    access.isCanteenStaff ||
    (isWorkingDay(today) && canteenGrantsToday > 0);

  // --- Quick actions (role-aware) -------------------------------------------
  const quickLinks: DashboardQuickLink[] = [{ label: "Emergency support", href: "/emergency" }];
  if (access.isCanteenStaff) quickLinks.push({ label: "Canteen", href: "/canteen" });
  if (isDriver) quickLinks.push({ label: "My driving tasks", href: "/transportation" });

  return { name, offshore, approvals, myRequests, quickLinks, canteenEntitledToday };
}
