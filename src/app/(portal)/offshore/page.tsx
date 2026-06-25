import { Suspense } from "react";
import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getAccommodationSummary,
  getAddableProfiles,
  getAllInstallations,
  getAssignableEmployees,
  getAllOffshoreTrips,
  getAllVisitRequests,
  getCertAlerts,
  getActiveMusterDrill,
  getMusterDrills,
  getCrewChangeSuggestions,
  getCrews,
  getEmergencyRoles,
  getEmergencyTeams,
  getMusterGroups,
  getFlights,
  getInstallations,
  getManifests,
  getMyOffshoreTrips,
  getMyVisitRequests,
  getPobBreakdown,
  getRooms,
  getRoster,
  getRotationCalendar,
  getVisitorSuggestions,
} from "@/lib/offshore";
import { OffshoreBoard } from "./_components/offshore-board";
import { OffshoreManagement } from "./_components/offshore-management";
import { CrewChangeSuggestions } from "./_components/crew-change-suggestions";
import { VisitorRequestForm } from "./_components/visitor-request-form";

export default async function OffshorePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const access = await getAccess();
  const isAdmin = isAdminRole(await getCurrentRole());
  const canManage = access.isAdmin || access.isCampboss || access.isOim;

  // One view at a time, driven by the sidebar submenu. Everyone lands on
  // "My trips" (the self-service area); managers can switch to a management view.
  const activeView = view ?? "mytrips";
  const showManagement = canManage && activeView !== "mytrips";
  const showMyTrips = !showManagement;

  const [mine, all, installations, flights, myVisits, suggestionLists, boardPeople, me] =
    await Promise.all([
      getMyOffshoreTrips(),
      isAdmin ? getAllOffshoreTrips() : Promise.resolve([]),
      getInstallations(),
      isAdmin ? getFlights() : Promise.resolve([]),
      getMyVisitRequests(),
      getVisitorSuggestions(),
      getAssignableEmployees(),
      createClient().auth.getUser().then((r) => r.data.user),
    ]);
  const meId = me?.id ?? "";
  const people = boardPeople.map((p) => ({ id: p.id, name: p.name }));

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
    emergencyRoles,
    emergencyTeams,
    musterGroups,
    musterDrill,
    musterDrillHistory,
  ] = showManagement
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
        getEmergencyRoles(),
        getEmergencyTeams(),
        getMusterGroups(),
        getActiveMusterDrill(),
        getMusterDrills(),
      ])
    : [[], [], [], [], null, null, [], [], [], [], { days: [], crews: [] }, [], [], [], [], [], null, []];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Offshore — Crew Change, POB &amp; Accommodation
        </h1>
        <p className="text-muted-foreground">
          Crew rotations, offshore-staff roster, room/bed accommodation, and live persons-on-board.
        </p>
        {canManage && (
          <Link
            href="/reports/offshore-certifications"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <FileBarChart className="h-4 w-4" /> Certification compliance report
          </Link>
        )}
      </div>

      {showManagement && activeView === "dashboard" && suggestions.length > 0 && (
        <CrewChangeSuggestions items={suggestions} />
      )}

      {showManagement && pobBreakdown && accommodation && (
        <Suspense fallback={null}>
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
          emergencyRoles={emergencyRoles}
          emergencyTeams={emergencyTeams}
          musterGroups={musterGroups}
          musterDrill={musterDrill}
          musterDrillHistory={musterDrillHistory}
        />
        </Suspense>
      )}

      {/* "My trips" lands on top — the user's own trips first, then the request forms. */}
      {showMyTrips && (
        <>
          <OffshoreBoard
            mine={mine}
            all={all}
            installations={installations}
            flights={flights}
            isAdmin={isAdmin}
            people={people}
            meId={meId}
          />

          <VisitorRequestForm
            installations={installations}
            mine={myVisits}
            nameSuggestions={suggestionLists.names}
            companySuggestions={suggestionLists.companies}
          />
        </>
      )}
    </div>
  );
}
