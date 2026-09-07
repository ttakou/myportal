import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
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
import { WhereIsPicker } from "./_components/where-is";
import { WhereIsCard } from "./_components/where-is-card";
import { getWhereabouts, getWhereaboutsPeople } from "@/lib/offshore/whereabouts";
import { effectiveManagementView, managementDataFor, type ManagementDataKey } from "./_components/offshore-view-data";
import type { AccommodationSummary, PobBreakdown } from "@/types/offshore";

export default async function OffshorePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; person?: string }>;
}) {
  const { view, person } = await searchParams;
  const access = await getAccess();
  const isAdmin = isAdminRole(await getCurrentRole());
  // Full managers see and edit everything; the Dispatcher also reaches the
  // management area but with a scoped, partly read-only set of views.
  const offshoreManager = access.isAdmin || access.isCampboss || access.isOim;
  // Holders of the offshore `create` verb (the seeded Receptionist / Radio
  // Operator / Operations Supervisor access roles) reach one view only:
  // registering non-rotational staff.
  const offshoreRegistrar = hasPermission(await getMyPermissions(), "offshore", "create");
  const canManage = offshoreManager || access.isDispatcher || offshoreRegistrar;
  const offshoreFlags = {
    manager: offshoreManager,
    dispatcher: access.isDispatcher,
    registrar: offshoreRegistrar,
  };

  // One view at a time, driven by the sidebar submenu. Everyone lands on
  // "My trips" (the self-service area); managers can switch to a management view.
  const activeView = view ?? "mytrips";
  const showManagement = canManage && activeView !== "mytrips";
  const showMyTrips = !showManagement;
  // "Where is…" is answered here on the server for one person at a time; it
  // needs none of the management area's data, so that is not loaded for it.
  const showWhereIs = showManagement && activeView === "whereis";
  const showMonolith = showManagement && !showWhereIs;
  // The view that will render, after the role fallback — so the data loaded
  // below is the data that view needs, not the data a deep link asked for.
  const managementView = showMonolith ? effectiveManagementView(activeView, offshoreFlags) : null;
  const need = managementView ? managementDataFor(managementView) : new Set<ManagementDataKey>();
  // Load a dataset only when the view on screen needs it; otherwise hand the
  // component the empty value so the props stay simple.
  const want = <T,>(key: ManagementDataKey, load: () => Promise<T>, empty: T): Promise<T> =>
    need.has(key) ? load() : Promise.resolve(empty);

  const [mine, installations, myVisits, suggestionLists, boardPeople, me, approvalVisits, approvalTrips] =
    await Promise.all([
      showMyTrips ? getMyOffshoreTrips() : Promise.resolve([]),
      getInstallations(),
      showMyTrips ? getMyVisitRequests() : Promise.resolve([]),
      showMyTrips ? getVisitorSuggestions() : Promise.resolve({ names: [], companies: [] }),
      showMyTrips ? getAssignableEmployees() : Promise.resolve([]),
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
  ] = await Promise.all([
    want("crews", getCrews, []),
    want("rooms", getRooms, []),
    want("roster", getRoster, []),
    want("addable", getAddableProfiles, []),
    want("pob", getPobBreakdown, null as PobBreakdown | null),
    want("accommodation", getAccommodationSummary, null as AccommodationSummary | null),
    want("certAlerts", getCertAlerts, []),
    want("visits", getAllVisitRequests, []),
    want("manifests", getManifests, []),
    want("manageInstallations", getAllInstallations, []),
    want("calendar", () => getRotationCalendar(8), { days: [], crews: [] }),
    want("employees", getAssignableEmployees, []),
    want("suggestions", getCrewChangeSuggestions, []),
    want("emergencyRoles", getEmergencyRoles, []),
    want("emergencyTeams", getEmergencyTeams, []),
    want("musterGroups", getMusterGroups, []),
    want("musterDrill", getActiveMusterDrill, null),
    want("musterDrillHistory", getMusterDrills, []),
    want("trips", getAllOffshoreTrips, []),
    want("flights", getFlights, []),
    want("defaultMode", getOffshoreDefaultMode, "auto" as const),
  ]);

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

      {managementView === "dashboard" && (
        <div className="space-y-4">
          {/* The tenant-wide default crew-change mode is a manager setting. */}
          {offshoreManager && <DefaultModeToggle mode={defaultMode} />}
          {suggestions.length > 0 && (
            <CrewChangeSuggestions items={suggestions} defaultMode={defaultMode} />
          )}
        </div>
      )}

      {showWhereIs && (
        <WhereIsSection selectedId={person ?? null} />
      )}

      {managementView && (
        <OffshoreManagement
          view={managementView}
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
      )}

      {/* "My trips" lands on top — the user's own trips first, then the request forms. */}
      {showMyTrips && (
        <>
          {canManage && (
        <PendingApprovals
          visits={approvalVisits}
          trips={approvalTrips}
          // Deciding needs the approve verb; a registrar sees the queue only.
          canDecide={offshoreManager || access.isDispatcher}
        />
      )}
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


/**
 * "Where is…": pick a name, read where the schedule puts them and which bed is
 * theirs. The picker is the only client piece; the answer is rendered here.
 */
async function WhereIsSection({ selectedId }: { selectedId: string | null }) {
  const [people, found] = await Promise.all([
    getWhereaboutsPeople(),
    selectedId ? getWhereabouts(selectedId) : Promise.resolve(null),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Where is…</h2>
        <p className="text-sm text-muted-foreground">
          Where the rotation schedule puts somebody today, what the trips record, and the bed that
          is theirs — the one in use while on board, otherwise their default.
        </p>
      </div>
      <WhereIsPicker people={people} selectedId={selectedId} />
      {selectedId && !found && (
        <p className="text-sm text-muted-foreground">Nobody with that id.</p>
      )}
      {found && <WhereIsCard w={found} />}
    </div>
  );
}
