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
  getOffshoreDefaultMode,
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
import { DefaultModeToggle } from "./_components/default-mode-toggle";
import { VisitorRequestForm } from "./_components/visitor-request-form";
import { PendingApprovals } from "./_components/pending-approvals";

export default async function OffshorePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const access = await getAccess();
  const isAdmin = isAdminRole(await getCurrentRole());
  // Full managers see and edit everything; the Dispatcher also reaches the
  // management area but with a scoped, partly read-only set of views.
  const offshoreManager = access.isAdmin || access.isCampboss || access.isOim;
  const canManage = offshoreManager || access.isDispatcher;
  const offshoreFlags = { manager: offshoreManager, dispatcher: access.isDispatcher };

  // One view at a time, driven by the sidebar submenu. Everyone lands on
  // "My trips" (the self-service area); managers can switch to a management view.
  const activeView = view ?? "mytrips";
  const showManagement = canManage && activeView !== "mytrips";
  const showMyTrips = !showManagement;

  const [mine, installations, myVisits, suggestionLists, boardPeople, me, approvalVisits, approvalTrips] =
    await Promise.all([
      getMyOffshoreTrips(),
      getInstallations(),
      getMyVisitRequests(),
      getVisitorSuggestions(),
      getAssignableEmployees(),
      createClient().auth.getUser().then((r) => r.data.user),
      // Approvers landing on "My trips" see their pending queue without having
      // to open the management area (fetched there separately when shown).
      canManage && showMyTrips ? getAllVisitRequests() : Promise.resolve([]),
      canManage && showMyTrips ? getAllOffshoreTrips() : Promise.resolve([]),
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
    trips,
    flights,
    // Tenant default for how crew changes open (auto vs manual).
    defaultMode,
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
        getAllOffshoreTrips(),
        getFlights(),
        getOffshoreDefaultMode(),
      ])
    : [[], [], [], [], null, null, [], [], [], [], { days: [], crews: [] }, [], [], [], [], [], null, [], [], [], "auto" as const];

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

      {showManagement && activeView === "dashboard" && (
        <div className="space-y-4">
          {/* The tenant-wide default crew-change mode is a manager setting. */}
          {offshoreManager && <DefaultModeToggle mode={defaultMode} />}
          {suggestions.length > 0 && (
            <CrewChangeSuggestions items={suggestions} defaultMode={defaultMode} />
          )}
        </div>
      )}

      {showManagement && pobBreakdown && accommodation && (
        <Suspense fallback={null}>
        <OffshoreManagement
          flags={offshoreFlags}
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
          trips={trips}
          flights={flights}
          canAddFlight={isAdmin}
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
          {canManage && <PendingApprovals visits={approvalVisits} trips={approvalTrips} />}
          <OffshoreBoard
            mine={mine}
            installations={installations}
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
