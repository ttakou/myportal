import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getAccommodationSummary,
  getAddableProfiles,
  getAllInstallations,
  getAssignableEmployees,
  getAllOffshoreTrips,
  getAllVisitRequests,
  getCertAlerts,
  getCrewChangeSuggestions,
  getCrews,
  getFlights,
  getInstallations,
  getManifests,
  getMyOffshoreTrips,
  getMyVisitRequests,
  getPob,
  getPobBreakdown,
  getRooms,
  getRoster,
  getRotationCalendar,
} from "@/lib/offshore";
import { OffshoreBoard } from "./_components/offshore-board";
import { OffshoreManagement } from "./_components/offshore-management";
import { CrewChangeSuggestions } from "./_components/crew-change-suggestions";
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

  const [
    crews,
    rooms,
    roster,
    addable,
    pobBreakdown,
    accommodation,
    certAlerts,
    visits,
    manifests,
    manageInstallations,
    calendar,
    employees,
    suggestions,
  ] = canManage
    ? await Promise.all([
        getCrews(),
        getRooms(),
        getRoster(),
        getAddableProfiles(),
        getPobBreakdown(),
        getAccommodationSummary(),
        getCertAlerts(),
        getAllVisitRequests(),
        getManifests(),
        getAllInstallations(),
        getRotationCalendar(8),
        getAssignableEmployees(),
        getCrewChangeSuggestions(),
      ])
    : [[], [], [], [], null, null, [], [], [], [], { days: [], crews: [] }, [], []];

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

      {canManage && suggestions.length > 0 && <CrewChangeSuggestions items={suggestions} />}

      {canManage && pobBreakdown && accommodation && (
        <OffshoreManagement
          crews={crews}
          rooms={rooms}
          roster={roster}
          manageInstallations={manageInstallations}
          installations={installations}
          addable={addable}
          pob={pobBreakdown}
          accommodation={accommodation}
          certAlerts={certAlerts}
          visits={visits}
          manifests={manifests}
          calendar={calendar}
          employees={employees}
          suggestions={suggestions}
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
