import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { getActiveServices } from "@/lib/services";
import {
  getAllTransportRequests,
  getAllVehicles,
  getDrivers,
  getMyDriver,
  getMyDriverTasks,
  getMyTransportRequests,
  getProfilesForLinking,
  getVehicles,
} from "@/lib/transport";
import { cn } from "@/lib/utils";
import { LiveRefresh } from "@/components/live-refresh";
import { DriverTasks } from "./_components/driver-tasks";
import { DispatchBoard } from "./_components/dispatch-board";
import { RequestForm } from "./_components/request-form";
import { RequestsList } from "./_components/requests-list";
import {
  resolveTransportView,
  TRANSPORT_VIEWS,
  transportViewAllowed,
  type TransportFlags,
} from "./_components/transport-views";

/**
 * One view at a time, driven by the sidebar submenu: the requests list,
 * the request form, the dispatch board, or a driver's tasks. Each view
 * loads only its own data.
 */
export default async function TransportationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const [role, perms, myDriver, services] = await Promise.all([
    getCurrentRole(),
    getMyPermissions(),
    getMyDriver(),
    getActiveServices(),
  ]);
  const isAdmin = isAdminRole(role);
  const flags: TransportFlags = {
    admin: isAdmin,
    driver: Boolean(myDriver),
    canCreate: isAdmin || hasPermission(perms, "transportation", "create"),
    outOfTown: services.some((s) => s.slug === "out-of-town"),
  };
  const active = resolveTransportView(view, flags);

  const [requests, drivers, vehicles, allVehicles, profiles, driverTasks] = await Promise.all([
    active === "requests" || active === "dispatch"
      ? isAdmin
        ? getAllTransportRequests()
        : getMyTransportRequests()
      : Promise.resolve([]),
    active === "dispatch" ? getDrivers() : Promise.resolve([]),
    active === "dispatch" ? getVehicles() : Promise.resolve([]),
    active === "dispatch" ? getAllVehicles() : Promise.resolve([]),
    active === "dispatch" ? getProfilesForLinking() : Promise.resolve([]),
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
      {active === "dispatch" && (
        <DispatchBoard all={requests} drivers={drivers} vehicles={vehicles} allVehicles={allVehicles} profiles={profiles} />
      )}
      {active === "driver" && myDriver && <DriverTasks driver={myDriver} tasks={driverTasks} />}
    </div>
  );
}
