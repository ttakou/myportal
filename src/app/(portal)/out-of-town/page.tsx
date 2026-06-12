import { getAccess } from "@/lib/auth";
import {
  getAirportDesk,
  getApprovalQueue,
  getEmergencyContacts,
  getMyTrips,
  getTravelDashboard,
  isManager,
} from "@/lib/trips";
import { TripsBoard } from "./_components/trips-board";
import { TravelDashboardView } from "./_components/travel-dashboard";
import { EmergencyContacts } from "./_components/emergency-contacts";
import { AirportDesk } from "./_components/airport-desk";

export default async function OutOfTownPage() {
  const access = await getAccess();
  const isCoordinator = access.isAdmin;

  const [mine, queue, dashboard, contacts, manager, desk] = await Promise.all([
    getMyTrips(),
    getApprovalQueue(),
    getTravelDashboard(),
    getEmergencyContacts(),
    isManager(),
    isCoordinator ? getAirportDesk() : Promise.resolve([]),
  ]);

  const canApprove = access.isAdmin || manager;
  const canManageContacts = access.isAdmin || access.isSafetyAdmin;
  const showDashboard = access.isAdmin || access.isSafetyAdmin || manager;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Travel, Meet &amp; Greet</h1>
        <p className="text-muted-foreground">
          Declare travel, arrange airport assistance, check in along the way, and reach help fast.
        </p>
      </div>

      {showDashboard && <TravelDashboardView data={dashboard} />}

      {isCoordinator && <AirportDesk trips={desk} />}

      <TripsBoard mine={mine} queue={queue} canApprove={canApprove} />

      <EmergencyContacts contacts={contacts} canManage={canManageContacts} />
    </div>
  );
}
