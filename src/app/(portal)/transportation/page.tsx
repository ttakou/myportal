import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { hasDirectReports } from "@/lib/appraisals";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { getActiveServices } from "@/lib/services";
import { getModuleSettings } from "@/lib/module-settings";
import { localDate } from "@/lib/transport/day-plan";
import {
  getAllDrivers,
  getAllTransportRequests,
  getAllVehicles,
  getApprovalQueue,
  getDrivers,
  getMyDriver,
  getMyDriverTasks,
  getMyTransportRequests,
  getProfilesForLinking,
  getRequestsForDay,
  getShuttles,
  getVehicles,
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
  const [role, perms, myDriver, services, isManager, cfg] = await Promise.all([
    getCurrentRole(),
    getMyPermissions(),
    getMyDriver(),
    getActiveServices(),
    hasDirectReports(),
    getModuleSettings("transportation"),
  ]);
  const isAdmin = isAdminRole(role);
  const flags: TransportFlags = {
    admin: isAdmin,
    manager: isManager,
    driver: Boolean(myDriver),
    canCreate: isAdmin || hasPermission(perms, "transportation", "create"),
    outOfTown: services.some((s) => s.slug === "out-of-town"),
  };
  const active = resolveTransportView(view, flags);
  const approvalOn = cfg.require_approval === true;
  const plannerDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(new Date().toISOString());

  const [requests, approvals, dayRequests, drivers, allDrivers, vehicles, allVehicles, profiles, shuttles, driverTasks] =
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
      active === "shuttles" ? getShuttles() : Promise.resolve([]),
      active === "driver" ? getMyDriverTasks() : Promise.resolve([]),
    ]);

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
        <RequestsList requests={requests} scope={isAdmin ? "all" : "mine"} canCreate={flags.canCreate} canDispatch={isAdmin} />
      )}
      {active === "new" && <RequestForm />}
      {active === "approvals" && <ApprovalsPanel requests={approvals} approvalOn={approvalOn} />}
      {active === "dispatch" && <DispatchBoard all={requests} drivers={drivers} vehicles={vehicles} />}
      {active === "planner" && (
        <DayPlanner
          date={plannerDate}
          requests={dayRequests}
          drivers={drivers}
          vehicles={vehicles}
          clashMinutes={Math.round(Number(cfg.conflict_window_hours ?? 2) * 60)}
        />
      )}
      {active === "fleet" && <FleetPanel drivers={allDrivers} vehicles={allVehicles} profiles={profiles} approvalOn={approvalOn} />}
      {active === "shuttles" && <ShuttlesPanel shuttles={shuttles} drivers={drivers} vehicles={vehicles} />}
      {active === "driver" && myDriver && <DriverTasks driver={myDriver} tasks={driverTasks} />}
    </div>
  );
}
