import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getAccommodationSummary,
  getAddableProfiles,
  getAllOffshoreTrips,
  getAllVisitRequests,
  getCertAlerts,
  getCrews,
  getFlights,
  getInstallations,
  getMyOffshoreTrips,
  getMyVisitRequests,
  getPob,
  getPobBreakdown,
  getRooms,
  getRoster,
} from "@/lib/offshore";
import { OffshoreBoard } from "./_components/offshore-board";
import { OffshoreManagement } from "./_components/offshore-management";
import { VisitorRequestForm } from "./_components/visitor-request-form";

export default async function OffshorePage() {
  const access = await getAccess();
  const isAdmin = isAdminRole(await getCurrentRole());
  const canManage = access.isAdmin || access.isSafetyAdmin;

  const [mine, all, installations, flights, pob, myVisits] = await Promise.all([
    getMyOffshoreTrips(),
    isAdmin ? getAllOffshoreTrips() : Promise.resolve([]),
    getInstallations(),
    isAdmin ? getFlights() : Promise.resolve([]),
    isAdmin ? getPob() : Promise.resolve([]),
    getMyVisitRequests(),
  ]);

  const [crews, rooms, roster, addable, pobBreakdown, accommodation, certAlerts, visits] =
    canManage
      ? await Promise.all([
          getCrews(),
          getRooms(),
          getRoster(),
          getAddableProfiles(),
          getPobBreakdown(),
          getAccommodationSummary(),
          getCertAlerts(),
          getAllVisitRequests(),
        ])
      : [[], [], [], [], null, null, [], []];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Offshore — Crew Change, POB &amp; Accommodation
        </h1>
        <p className="text-muted-foreground">
          Crew rotations, offshore-staff roster, room/bed accommodation, and live persons-on-board.
        </p>
      </div>

      {canManage && pobBreakdown && accommodation && (
        <OffshoreManagement
          crews={crews}
          rooms={rooms}
          roster={roster}
          installations={installations}
          addable={addable}
          pob={pobBreakdown}
          accommodation={accommodation}
          certAlerts={certAlerts}
          visits={visits}
        />
      )}

      <VisitorRequestForm installations={installations} mine={myVisits} />

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
