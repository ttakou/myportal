import { getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getAllTransportRequests,
  getDrivers,
  getMyTransportRequests,
  getVehicles,
} from "@/lib/transport";
import { TransportBoard } from "./_components/transport-board";

export default async function TransportationPage() {
  const role = await getCurrentRole();
  const isAdmin = isAdminRole(role);

  const [mine, all, drivers, vehicles] = await Promise.all([
    getMyTransportRequests(),
    isAdmin ? getAllTransportRequests() : Promise.resolve([]),
    isAdmin ? getDrivers() : Promise.resolve([]),
    isAdmin ? getVehicles() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transportation</h1>
        <p className="text-muted-foreground">
          Request a vehicle and track driver assignment.
        </p>
      </div>
      <TransportBoard
        mine={mine}
        all={all}
        drivers={drivers}
        vehicles={vehicles}
        isAdmin={isAdmin}
      />
    </div>
  );
}
