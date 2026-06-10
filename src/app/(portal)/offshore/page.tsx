import { getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getAllOffshoreTrips,
  getFlights,
  getInstallations,
  getMyOffshoreTrips,
  getPob,
} from "@/lib/offshore";
import { OffshoreBoard } from "./_components/offshore-board";

export default async function OffshorePage() {
  const isAdmin = isAdminRole(await getCurrentRole());
  const [mine, all, installations, flights, pob] = await Promise.all([
    getMyOffshoreTrips(),
    isAdmin ? getAllOffshoreTrips() : Promise.resolve([]),
    getInstallations(),
    isAdmin ? getFlights() : Promise.resolve([]),
    isAdmin ? getPob() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Offshore Trip</h1>
        <p className="text-muted-foreground">
          HSE clearance, helicopter manifests and POB tracking.
        </p>
      </div>
      <OffshoreBoard
        mine={mine}
        all={all}
        installations={installations}
        flights={flights}
        pob={pob}
        isAdmin={isAdmin}
      />
    </div>
  );
}
