import { getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getAllTransportRequests,
  getDrivers,
  getMyDriver,
  getMyDriverTasks,
  getMyTransportRequests,
  getProfilesForLinking,
  getVehicles,
} from "@/lib/transport";
import { LiveRefresh } from "@/components/live-refresh";
import { TransportBoard } from "./_components/transport-board";
import { DriverTasks } from "./_components/driver-tasks";
import { DispatchBoard } from "./_components/dispatch-board";

export default async function TransportationPage() {
  const role = await getCurrentRole();
  const isAdmin = isAdminRole(role);

  const [mine, all, drivers, vehicles, myDriver, driverTasks, profiles] = await Promise.all([
    getMyTransportRequests(),
    isAdmin ? getAllTransportRequests() : Promise.resolve([]),
    isAdmin ? getDrivers() : Promise.resolve([]),
    isAdmin ? getVehicles() : Promise.resolve([]),
    getMyDriver(),
    getMyDriverTasks(),
    isAdmin ? getProfilesForLinking() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transportation</h1>
          <p className="text-muted-foreground">
            Request rides, dispatch tasks to drivers, and follow up live.
          </p>
        </div>
        <LiveRefresh />
      </div>

      {myDriver && <DriverTasks driver={myDriver} tasks={driverTasks} />}

      {isAdmin && (
        <DispatchBoard all={all} drivers={drivers} vehicles={vehicles} profiles={profiles} />
      )}

      <TransportBoard mine={mine} />
    </div>
  );
}
