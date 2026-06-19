import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
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
import { LiveRefresh } from "@/components/live-refresh";
import { TransportBoard } from "./_components/transport-board";
import { DriverTasks } from "./_components/driver-tasks";
import { DispatchBoard } from "./_components/dispatch-board";

export default async function TransportationPage() {
  const role = await getCurrentRole();
  const isAdmin = isAdminRole(role);

  const [mine, all, drivers, vehicles, allVehicles, myDriver, driverTasks, profiles] =
    await Promise.all([
      getMyTransportRequests(),
      isAdmin ? getAllTransportRequests() : Promise.resolve([]),
      isAdmin ? getDrivers() : Promise.resolve([]),
      isAdmin ? getVehicles() : Promise.resolve([]),
      isAdmin ? getAllVehicles() : Promise.resolve([]),
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

      {myDriver && <DriverTasks driver={myDriver} tasks={driverTasks} />}

      {isAdmin && (
        <DispatchBoard
          all={all}
          drivers={drivers}
          vehicles={vehicles}
          allVehicles={allVehicles}
          profiles={profiles}
        />
      )}

      <TransportBoard mine={mine} />
    </div>
  );
}
