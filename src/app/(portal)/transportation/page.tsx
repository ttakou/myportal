import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { getCachedUser, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { getActiveServices } from "@/lib/services";
import { getModuleSettings } from "@/lib/module-settings";
import { localDate, shiftDate } from "@/lib/transport/day-plan";
import { BOOKING_DAYS_AHEAD } from "@/lib/transport/seats";
import { escalateStaleApprovalsHere } from "@/lib/transport-approval-escalation";
import {
  getApprovalAccess,
  getAllDrivers,
  getAllTransportRequests,
  getAllVehicles,
  getApprovalQueue,
  getDrivers,
  getManifestsFor,
  getMyDriver,
  getMyDriverTasks,
  getMyTransportRequests,
  getPlaces,
  getProfilesForLinking,
  getRequestsForDay,
  getSeatsBetween,
  getShuttles,
  getVehicles,
  hasActiveShuttles,
} from "@/lib/transport";
import { cn } from "@/lib/utils";
import { LiveRefresh } from "@/components/live-refresh";
import { ApprovalsPanel } from "./_components/approvals-panel";
import { DayPlanner } from "./_components/day-planner";
import { DriverTasks } from "./_components/driver-tasks";
import { DispatchBoard } from "./_components/dispatch-board";
import { FleetPanel } from "./_components/fleet-panel";
import { RequestForm } from "./_components/request-form";
import { RequestsList } from "./_components/requests-list";
import { SeatsPanel } from "./_components/seats-panel";
import { ShuttlesPanel } from "./_components/shuttles-panel";
import {
  resolveTransportView,
  TRANSPORT_VIEWS,
  transportViewAllowed,
  type TransportFlags,
} from "./_components/transport-views";

/**
 * One view at a time, driven by the sidebar submenu: the requests list,
 * the request form, approvals, the dispatch board, the day planner, the
 * fleet, the shuttle schedules, or a driver's tasks. Each view loads only
 * its own data.
 */
export default async function TransportationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { view, date } = await searchParams;
  const [role, perms, myDriver, services, approvalAccess, cfg, shuttlesOn, me] = await Promise.all([
    getCurrentRole(),
    getMyPermissions(),
    getMyDriver(),
    getActiveServices(),
    getApprovalAccess(),
    getModuleSettings("transportation"),
    hasActiveShuttles(),
    getCachedUser(),
  ]);
  const isAdmin = isAdminRole(role);
  const flags: TransportFlags = {
    admin: isAdmin,
    manager: approvalAccess.approver,
    approvals: approvalAccess.showApprovals,
    driver: Boolean(myDriver),
    canCreate: isAdmin || hasPermission(perms, "transportation", "create"),
    outOfTown: services.some((s) => s.slug === "out-of-town"),
    shuttles: shuttlesOn,
  };
  const active = resolveTransportView(view, flags);
  const approvalOn = cfg.require_approval === true;
  const nowIso = new Date().toISOString();
  const today = localDate(nowIso);
  const plannerDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;

  // The desk opening the module is the other moment (besides the nightly
  // job) an unanswered approval is passed on, so it never waits past the
  // delay by more than a page load.
  if (isAdmin && approvalAccess.queued > 0 && (active === "requests" || active === "approvals" || active === "dispatch" || active === "planner")) {
    await escalateStaleApprovalsHere();
  }

  const [requests, approvals, dayRequests, drivers, allDrivers, vehicles, allVehicles, profiles, shuttles, places, driverTasks, seats] =
    await Promise.all([
      active === "requests" || active === "dispatch"
        ? isAdmin
          ? getAllTransportRequests()
          : getMyTransportRequests()
        : Promise.resolve([]),
      active === "approvals" ? getApprovalQueue() : Promise.resolve([]),
      active === "planner" ? getRequestsForDay(plannerDate) : Promise.resolve([]),
      active === "dispatch" || active === "planner" || active === "shuttles" ? getDrivers() : Promise.resolve([]),
      active === "fleet" ? getAllDrivers() : Promise.resolve([]),
      active === "dispatch" || active === "planner" || active === "shuttles" ? getVehicles() : Promise.resolve([]),
      active === "fleet" ? getAllVehicles() : Promise.resolve([]),
      active === "fleet" ? getProfilesForLinking() : Promise.resolve([]),
      active === "shuttles" || active === "planner" || active === "seats" ? getShuttles() : Promise.resolve([]),
      active === "new" || active === "requests" || active === "dispatch" || active === "shuttles" || active === "fleet" ? getPlaces() : Promise.resolve([]),
      active === "driver" ? getMyDriverTasks() : Promise.resolve([]),
      active === "seats" ? getSeatsBetween(today, shiftDate(today, BOOKING_DAYS_AHEAD)) : Promise.resolve({}),
    ]);
  // Who is on each shuttle run the driver or the desk is looking at.
  const manifests = active === "driver" ? await getManifestsFor(driverTasks) : active === "dispatch" ? await getManifestsFor(requests) : {};

  const tabs = TRANSPORT_VIEWS.filter((v) => transportViewAllowed(v.key, flags));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transportation</h1>
          <p className="text-muted-foreground">
            Request rides, dispatch tasks to drivers, and follow up live.
          </p>
          {isAdmin && (
            <Link
              href="/reports/transport"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <FileBarChart className="h-4 w-4" /> Requests & SLA report
            </Link>
          )}
        </div>
        <LiveRefresh />
      </div>

      {tabs.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b" aria-label="Sub-views">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/transportation?view=${t.key}`}
              aria-current={t.key === active ? "page" : undefined}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
                t.key === active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {active === "requests" && (
        <RequestsList requests={requests} scope={isAdmin ? "all" : "mine"} canCreate={flags.canCreate} canDispatch={isAdmin} places={places} />
      )}
      {active === "new" && <RequestForm places={places} />}
      {active === "seats" && <SeatsPanel shuttles={shuttles} seats={seats} nowIso={nowIso} meId={me?.id ?? null} isAdmin={isAdmin} />}
      {active === "approvals" && (
        <ApprovalsPanel requests={approvals} approvalOn={approvalOn} escalationHours={Number(cfg.approval_escalation_hours ?? 24)} />
      )}
      {active === "dispatch" && <DispatchBoard
          all={requests}
          drivers={drivers}
          vehicles={vehicles}
          places={places}
          lateMinutes={Number(cfg.late_start_alert_minutes ?? 15)}
          manifests={manifests}
        />}
      {active === "planner" && (
        <DayPlanner
          date={plannerDate}
          requests={dayRequests}
          drivers={drivers}
          vehicles={vehicles}
          shuttles={shuttles}
          clashMinutes={Math.round(Number(cfg.conflict_window_hours ?? 2) * 60)}
        />
      )}
      {active === "fleet" && (
        <FleetPanel drivers={allDrivers} vehicles={allVehicles} profiles={profiles} places={places} approvalOn={approvalOn} />
      )}
      {active === "shuttles" && <ShuttlesPanel shuttles={shuttles} drivers={drivers} vehicles={vehicles} places={places} />}
      {active === "driver" && myDriver && <DriverTasks driver={myDriver} tasks={driverTasks} manifests={manifests} />}
    </div>
  );
}
