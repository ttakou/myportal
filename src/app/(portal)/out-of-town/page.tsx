import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getApprovalQueue, getMyTrips } from "@/lib/trips";
import { TripsBoard } from "./_components/trips-board";

export default async function OutOfTownPage() {
  const role = await getCurrentRole();
  const isAdmin = isAdminRole(role);
  const [mine, queue] = await Promise.all([getMyTrips(), getApprovalQueue()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Out of Town Trip</h1>
        <p className="text-muted-foreground">
          Missions, multi-tier approval and expense reconciliation.
        </p>
      </div>
      <TripsBoard mine={mine} queue={queue} isAdmin={isAdmin} />
    </div>
  );
}
