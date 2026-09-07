"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { Installation } from "@/types/offshore";
import type {
  EmergencyRole,
  EmergencyTeamMember,
  MusterDrill,
  AccommodationSummary,
  AssignableEmployee,
  CertAlert,
  Crew,
  CrewChangeSuggestion,
  Flight,
  Manifest,
  OffshoreTrip,
  PobBreakdown,
  Room,
  RosterEntry,
  RotationCalendar,
  VisitRequest,
} from "@/types/offshore";
import {
  hubForOffshoreView,
  offshoreViewPerm,
  offshoreHubTabs,
  type OffshoreRoleFlags,
  type OffshoreViewKey,
} from "./offshore-views";
import type { MusterDrillSummary } from "./views/muster-drill";

// Each view is its own chunk: a static import would put every view into the
// one bundle the route downloads, which is what the single file did.
const loading = () => <p className="text-sm text-muted-foreground">Loading…</p>;
const Dashboard = dynamic(() => import("./views/dashboard").then((m) => m.Dashboard), { loading });
const LiveBoardPanel = dynamic(() => import("./views/live-board").then((m) => m.LiveBoardPanel), { loading });
const InstallationsPanel = dynamic(() => import("./views/installations").then((m) => m.InstallationsPanel), { loading });
const CrewsPanel = dynamic(() => import("./views/crews").then((m) => m.CrewsPanel), { loading });
const RotationCalendarPanel = dynamic(() => import("./views/rotation-calendar").then((m) => m.RotationCalendarPanel), { loading });
const RoomsPanel = dynamic(() => import("./views/rooms").then((m) => m.RoomsPanel), { loading });
const BedBoardPanel = dynamic(() => import("./views/bed-board").then((m) => m.BedBoardPanel), { loading });
const RosterPanel = dynamic(() => import("./views/roster").then((m) => m.RosterPanel), { loading });
const VisitorsPanel = dynamic(() => import("./views/visitors").then((m) => m.VisitorsPanel), { loading });
const ManifestsPanel = dynamic(() => import("./views/manifests").then((m) => m.ManifestsPanel), { loading });
const EmergencyRolesPanel = dynamic(() => import("./views/emergency-roles").then((m) => m.EmergencyRolesPanel), { loading });
const MusterDrillPanel = dynamic(() => import("./views/muster-drill").then((m) => m.MusterDrillPanel), { loading });
const CateringPanel = dynamic(() => import("./catering-panel").then((m) => m.CateringPanel), { loading });
const HistoryPanel = dynamic(() => import("./history-panel").then((m) => m.HistoryPanel), { loading });
const StaffRotationPanel = dynamic(() => import("./staff-rotation-panel").then((m) => m.StaffRotationPanel), { loading });
const TripsPanel = dynamic(() => import("./trips-panel").then((m) => m.TripsPanel), { loading });
const AttendancePanel = dynamic(() => import("./attendance-panel").then((m) => m.AttendancePanel), { loading });
const CrewAssign = dynamic(() => import("./crew-assign").then((m) => m.CrewAssign), { loading });
const RegisterNonRotational = dynamic(() => import("./register-non-rotational").then((m) => m.RegisterNonRotational), { loading });

/**
 * The management area: a hub's tab bar and one view.
 *
 * The view is decided on the server (see `effectiveManagementView`), which
 * loads only that view's data and passes the rest as empty. Each view lives in
 * its own file under `./views`, so a browser opening "Installations" does not
 * download the manifest builder.
 */
export function OffshoreManagement(props: {
  view: OffshoreViewKey;
  flags: OffshoreRoleFlags;
  crews: Crew[];
  rooms: Room[];
  roster: RosterEntry[];
  installations: Installation[];
  manageInstallations: Installation[];
  addable: { id: string; full_name: string }[];
  /** Null when the view does not need it. */
  pob: PobBreakdown | null;
  accommodation: AccommodationSummary | null;
  certAlerts: CertAlert[];
  visits: VisitRequest[];
  manifests: Manifest[];
  trips: OffshoreTrip[];
  flights: Flight[];
  canAddFlight: boolean;
  calendar: RotationCalendar;
  employees: AssignableEmployee[];
  suggestions: CrewChangeSuggestion[];
  emergencyRoles: EmergencyRole[];
  emergencyTeams: EmergencyTeamMember[];
  musterGroups: string[];
  musterDrill: MusterDrill | null;
  musterDrillHistory: MusterDrillSummary[];
}) {
  const tab = props.view;
  // Views the user may only read render with their write controls disabled.
  const readOnly = offshoreViewPerm(tab, props.flags) === "view";
  // Consolidated navigation: sibling views of this view's hub render as tabs
  // (only those the role may open).
  const hub = hubForOffshoreView(tab);
  const tabs = hub ? offshoreHubTabs(hub, props.flags) : [];
  const onboard = props.pob?.people ?? [];

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b" aria-label="Sub-views">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/offshore?view=${t.key}`}
              aria-current={t.key === tab ? "page" : undefined}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
                t.key === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {tab === "dashboard" && props.pob && props.accommodation && (
        <Dashboard
          canDecide={props.flags.manager || props.flags.dispatcher}
          pob={props.pob}
          accommodation={props.accommodation}
          certAlerts={props.certAlerts}
          crews={props.crews}
          rooms={props.rooms}
          roster={props.roster}
          visits={props.visits}
          trips={props.trips}
        />
      )}
      {tab === "board" && (
        <LiveBoardPanel
          people={onboard}
          emergencyRoles={props.emergencyRoles}
          emergencyTeams={props.emergencyTeams}
          musterGroups={props.musterGroups}
          installations={props.installations}
          readOnly={readOnly}
        />
      )}
      {tab === "installations" && <InstallationsPanel installations={props.manageInstallations} />}
      {tab === "crews" && (
        <CrewsPanel
          crews={props.crews}
          installations={props.installations}
          suggestions={props.suggestions}
          roster={props.roster}
          onboard={onboard}
        />
      )}
      {tab === "calendar" && <RotationCalendarPanel calendar={props.calendar} crews={props.crews} />}
      {tab === "attendance" && <AttendancePanel installations={props.installations} />}
      {tab === "rooms" && (
        <RoomsPanel
          rooms={props.rooms}
          installations={props.installations}
          roster={props.roster}
          employees={props.employees}
          onboard={onboard}
          readOnly={readOnly}
        />
      )}
      {tab === "bedboard" && (
        <BedBoardPanel
          rooms={props.rooms}
          onboard={onboard}
          roster={props.roster}
          employees={props.employees}
          readOnly={readOnly}
        />
      )}
      {tab === "roster" && (
        <RosterPanel
          roster={props.roster}
          crews={props.crews}
          rooms={props.rooms}
          addable={props.addable}
        />
      )}
      {tab === "register" && (
        <RegisterNonRotational
          roster={props.roster}
          addable={props.addable}
          onboard={onboard}
          // Boarding is an `operate` act; the registrar roles hold only
          // `create`, so they register people without putting them on board.
          canBoard={props.flags.manager || props.flags.dispatcher}
          readOnly={readOnly}
        />
      )}
      {tab === "visitors" && <VisitorsPanel visits={props.visits} />}
      {tab === "manifests" && (
        <ManifestsPanel
          manifests={props.manifests}
          crews={props.crews}
          roster={props.roster}
          employees={props.employees}
          onboard={onboard}
          visits={props.visits}
        />
      )}
      {tab === "trips" && (
        <TripsPanel all={props.trips} flights={props.flights} canAddFlight={props.canAddFlight} />
      )}
      {tab === "assign" && <CrewAssign employees={props.employees} crews={props.crews} />}
      {tab === "catering" && <CateringPanel installations={props.installations} />}
      {tab === "emergency" && (
        <EmergencyRolesPanel
          roles={props.emergencyRoles}
          teams={props.emergencyTeams}
          musterGroups={props.musterGroups}
          roster={props.roster}
        />
      )}
      {tab === "drill" && (
        <MusterDrillPanel
          drill={props.musterDrill}
          history={props.musterDrillHistory}
          emergencyTeams={props.emergencyTeams}
        />
      )}
      {tab === "history" && <HistoryPanel />}
      {tab === "staff-history" && <StaffRotationPanel />}
    </div>
  );
}
