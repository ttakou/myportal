import Link from "next/link";
import { BookOpenCheck, BookUser, FileBarChart, Siren } from "lucide-react";
import { getAccess, getCachedUser, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { getBadges, getVisitors, getDepartments } from "@/lib/visitors";
import { hasTransportationModule } from "@/lib/visitors-transport";
import { createClient } from "@/lib/supabase/server";
import { BadgePanel } from "./_components/badge-panel";
import { getStaffRoster } from "@/lib/staff-attendance";
import { today } from "@/lib/canteen";
import { VisitorsBoard } from "./_components/visitors-board";
import { StaffBoard } from "./_components/staff-board";

export default async function VisitorsPage(
  props: {
    searchParams: Promise<{ date?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const visitDate =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : today();

  const [visitors, role, access, perms, departments, me, badges, transportOn] = await Promise.all([
    getVisitors(visitDate),
    getCurrentRole(),
    getAccess(),
    getMyPermissions(),
    getDepartments(),
    getCachedUser(),
    getBadges(),
    hasTransportationModule(createClient()),
  ]);
  const isAdmin = isAdminRole(role);
  // Security / reception / emergency responders (e.g. ERTL) plus admins get the
  // staff check-in roster, the muster list and the throughput report — the same
  // audience that can operate visitor check-in/out.
  const canOperate =
    access.isAdmin || access.isSystemAdmin || hasPermission(perms, "visitors", "operate");
  const canSeeReport = canOperate || access.isOim;
  const staffRoster = canOperate ? await getStaffRoster(visitDate) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitors</h1>
          <p className="text-muted-foreground">Pre-registration & reception · {visitDate}</p>
        </div>
        <div className="flex items-center gap-2">
          {canSeeReport && (
            <Link
              href="/reports/visitors"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <FileBarChart className="h-4 w-4" />
              Throughput report
            </Link>
          )}
          {canOperate && (
            <Link
              href="/visitors/directory"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <BookUser className="h-4 w-4" />
              Directory
            </Link>
          )}
          {canOperate && (
            <Link
              href="/visitors/register"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <BookOpenCheck className="h-4 w-4" />
              Access register
            </Link>
          )}
          {canOperate && (
            <Link
              href="/visitors/muster"
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <Siren className="h-4 w-4" />
              Muster list
            </Link>
          )}
        </div>
      </div>

      <VisitorsBoard
        visitDate={visitDate}
        visitors={visitors}
        isAdmin={isAdmin}
        departments={departments}
        meId={me?.id ?? null}
        badges={badges}
        transportOn={transportOn}
      />

      {canOperate && <BadgePanel badges={badges} visitors={visitors} />}

      {canOperate && <StaffBoard rows={staffRoster} />}
    </div>
  );
}
