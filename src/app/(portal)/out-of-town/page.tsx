import { getAccess } from "@/lib/auth";
import {
  getApprovalQueue,
  getEmergencyContacts,
  getMyTrips,
  getTravelDashboard,
  isManager,
} from "@/lib/trips";
import { TripsBoard } from "./_components/trips-board";
import { TravelDashboardView } from "./_components/travel-dashboard";
import { EmergencyContacts } from "./_components/emergency-contacts";

export default async function OutOfTownPage() {
  const [access, mine, queue, dashboard, contacts, manager] = await Promise.all([
    getAccess(),
    getMyTrips(),
    getApprovalQueue(),
    getTravelDashboard(),
    getEmergencyContacts(),
    isManager(),
  ]);

  const canApprove = access.isAdmin || manager;
  const canManageContacts = access.isAdmin || access.isSafetyAdmin;
  const showDashboard = access.isAdmin || access.isSafetyAdmin || manager;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Travel Safety</h1>
        <p className="text-muted-foreground">
          Declare out-of-town travel, check in along the way, and reach help fast.
        </p>
      </div>

      {showDashboard && <TravelDashboardView data={dashboard} />}

      <TripsBoard mine={mine} queue={queue} canApprove={canApprove} />

      <EmergencyContacts contacts={contacts} canManage={canManageContacts} />
    </div>
  );
}
