"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStatusTransition } from "@/components/activity";
import {
  AlertTriangle,
  BedDouble,
  FileText,
  History,
  ChevronDown,
  Printer,
  RefreshCw,
  Trash2,
  Siren,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { planManifest, seatOverflow } from "@/lib/offshore/manifest-plan";
import {
  crewFill,
  manifestCandidates,
  pendingMovements,
  planPicksAsCandidates,
  type ManifestCandidate,
} from "@/lib/offshore/manifest-picker";
import { bedCandidates, type BedCandidate } from "@/lib/offshore/bed-candidates";
import { bedKey, duplicateBedKeys, roomBedIssues } from "@/lib/offshore/bed-issues";
import { roomLabel, sortRooms } from "@/lib/offshore/room-order";
import { offshorePeople } from "@/lib/offshore/people";
import { countAwaitingBed, visitorsAwaitingBed } from "@/lib/offshore/visitor-queue";
import { manifestDescriptor } from "@/lib/offshore/manifest-label";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { SearchSelect } from "@/components/ui/search-select";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import type { Installation } from "@/types/offshore";
import {
  GENDER_LABEL,
  MANIFEST_STATUS_LABEL,
  ROOM_STATUS_LABEL,
  TRIP_TYPE_LABEL,
  VISIT_STATUS_LABEL,
  VISITOR_TYPE_LABEL,
  EMERGENCY_ROLE_LABEL,
  EMERGENCY_TEAM_LABEL,
  type EmergencyRole,
  type EmergencyRoleKind,
  type EmergencyTeamKind,
  type EmergencyTeamMember,
  type MusterDrill,
  type AccommodationSummary,
  type AssignableEmployee,
  type CertAlert,
  type Crew,
  type CrewChangeSuggestion,
  type Flight,
  type GenderRestriction,
  type Manifest,
  type ManifestStatus,
  type OffshoreTrip,
  type PobBreakdown,
  type PobOnboard,
  type Room,
  type RoomAvailability,
  type RoomStatus,
  type RosterEntry,
  type RotationCalendar,
  type RotationDay,
  type VisitRequest,
  type VisitStatus,
} from "@/types/offshore";
import {
  addRosterMember,
  allocateVisitorBed,
  assignToCrew,
  autoAssignBySchedule,
  confirmManifestMovement,
  decideVisitRequest,
  decideVisitGroup,
  boardMember,
  deleteCrew,
  deleteEmergencyWindow,
  setEmergencyRole,
  startMusterDrill,
  setMusterCheckin,
  endMusterDrill,
  addEmergencyTeamMember,
  removeEmergencyTeamMember,
  offboardTrip,
  reassignTripRoom,
  autoAllocateBeds,
  setTripCategory,
  findAvailableBeds,
  createManifest,
  generateNextCrewChange,
  removeManifestPax,
  reverseManifestPax,
  removeRosterMember,
  setInstallationActive,
  setManifestStatus,
  setRoomStatus,
  addCasualVisitor,
  setPersonLifeboat,
  setVisitorMovement,
  togglePaxNoShow,
  updateManifestTransport,
  updateRoomFields,
  updateRosterMember,
  upsertCrew,
  upsertInstallation,
  upsertRoom,
} from "../actions";
import { BulkRoomImport } from "./bulk-room-import";
import { BulkRosterImport } from "./bulk-roster-import";
import { CateringPanel } from "./catering-panel";
import { HistoryPanel } from "./history-panel";
import { StaffRotationPanel } from "./staff-rotation-panel";
import { TripsPanel } from "./trips-panel";
import { PendingApprovals } from "./pending-approvals";
import { AttendancePanel } from "./attendance-panel";
import { CrewAssign } from "./crew-assign";
import { RegisterNonRotational } from "./register-non-rotational";
import {
  resolveManagementView,
  hubForOffshoreView,
  offshoreViewPerm,
  offshoreHubTabs,
  firstOffshoreManagementView,
  type OffshoreRoleFlags,
} from "./offshore-views";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
type Tab =
  | "dashboard"
  | "board"
  | "installations"
  | "crews"
  | "calendar"
  | "attendance"
  | "rooms"
  | "bedboard"
  | "roster"
  | "assign"
  | "register"
  | "visitors"
  | "manifests"
  | "trips"
  | "catering"
  | "emergency"
  | "drill"
  | "history"
  | "staff-history";

export function OffshoreManagement(props: {
  flags: OffshoreRoleFlags;
  crews: Crew[];
  rooms: Room[];
  roster: RosterEntry[];
  installations: Installation[];
  manageInstallations: Installation[];
  addable: { id: string; full_name: string }[];
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
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
  // The active view is driven by the sidebar submenu via the `?view=` query
  // param, so only one panel renders at a time. Unknown/"mytrips" falls back to
  // the dashboard (the page renders the self-service area for "mytrips").
  const searchParams = useSearchParams();
  const requested = resolveManagementView(searchParams.get("view")) as Tab;
  // Fall back to the first view the user may open if they deep-linked one their
  // role can't see (e.g. a Dispatcher hitting ?view=catering).
  const tab = (offshoreViewPerm(requested, props.flags) !== "none"
    ? requested
    : firstOffshoreManagementView(props.flags)) as Tab;
  // Views the user may only read render with their write controls disabled.
  const readOnly = offshoreViewPerm(tab, props.flags) === "view";
  // Consolidated navigation: sibling views of this view's hub render as tabs
  // (only those the role may open).
  const hub = hubForOffshoreView(tab);
  const tabs = hub ? offshoreHubTabs(hub, props.flags) : [];

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
      {tab === "dashboard" && (
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
          people={props.pob.people}
          emergencyRoles={props.emergencyRoles}
          emergencyTeams={props.emergencyTeams}
          musterGroups={props.musterGroups}
          installations={props.installations}
          readOnly={readOnly}
        />
      )}
      {tab === "installations" && <InstallationsPanel installations={props.manageInstallations} />}
      {tab === "crews" && (
        <CrewsPanel crews={props.crews} installations={props.installations} suggestions={props.suggestions} />
      )}
      {tab === "calendar" && <RotationCalendarPanel calendar={props.calendar} crews={props.crews} />}
      {tab === "attendance" && <AttendancePanel installations={props.installations} />}
      {tab === "rooms" && (
        <RoomsPanel
          rooms={props.rooms}
          installations={props.installations}
          roster={props.roster}
          employees={props.employees}
          onboard={props.pob.people}
          readOnly={readOnly}
        />
      )}
      {tab === "bedboard" && (
        <BedBoardPanel
          rooms={props.rooms}
          onboard={props.pob.people}
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
          onboard={props.pob.people}
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
          onboard={props.pob.people}
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

/**
 * Approved visitors still without a bed — the Campboss's booking queue.
 *
 * Approval and accommodation belong to different people: the OIM decides
 * whether a visit happens, the Campboss finds the room. Nothing joined the two,
 * so an approved visitor needing a bed showed up only as one card among all
 * visitors, with no count and no prompt. Grouped by installation because a
 * Campboss runs one platform.
 */
function VisitorBookingQueue({ visits }: { visits: VisitRequest[] }) {
  const groups = useMemo(
    () =>
      visitorsAwaitingBed(
        visits.map((v) => ({
          id: v.id,
          visitor_name: v.visitor_name,
          visitor_company: v.visitor_company,
          status: v.status,
          depart_date: v.depart_date,
          return_date: v.return_date,
          accommodation_required: v.accommodation_required,
          installation_id: v.installation_id,
          installation_name: v.installation_name,
          allocation: v.allocation,
        })),
      ),
    [visits],
  );
  const total = countAwaitingBed(groups);
  if (total === 0) return null;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 px-3 py-2">
        <BedDouble className="h-4 w-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-900">Visitors awaiting a bed</h3>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
          {total}
        </span>
        <Link
          href="/offshore?view=visitors"
          className="ml-auto rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
        >
          Book rooms
        </Link>
      </div>
      <div className="space-y-2 p-3">
        {groups.map((g) => (
          <div key={g.installation_id ?? "none"}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
              {g.installation_name} ({g.visits.length})
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {g.visits.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-2 text-xs text-amber-900">
                  <span className="font-medium">{v.visitor_name}</span>
                  {v.visitor_company && <span className="opacity-70">{v.visitor_company}</span>}
                  <span className="opacity-70">
                    {v.depart_date}
                    {v.return_date ? ` → ${v.return_date}` : ""}
                  </span>
                  {v.status === "onboard" && (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      already on board
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const EMERGENCY_ORDER: EmergencyRoleKind[] = [
  "evac_leader",
  "evac_assistant",
  "headcount_principal",
  "headcount_assistant",
];

/** Unlimited-membership emergency teams, in display order. */
const EMERGENCY_TEAMS: EmergencyTeamKind[] = ["hlo", "fire_team"];

/** Compact leader labels for the live board chips. */
const LEADER_SHORT: Record<EmergencyRoleKind, string> = {
  evac_leader: "Evac lead",
  evac_assistant: "Evac asst",
  headcount_principal: "HC lead",
  headcount_assistant: "HC asst",
};

/**
 * Live offshore board — who is on board right now, grouped by muster station
 * (lifeboat), each with its assigned room/bed, plus the evacuation & head-count
 * leaders for the current rotation window (flagged by whether the leader is
 * actually on board). Auto-refreshes so it can run on a control-room screen.
 */
function LiveBoardPanel({
  people,
  emergencyRoles,
  emergencyTeams,
  musterGroups,
  installations,
  readOnly = false,
}: {
  people: PobOnboard[];
  emergencyRoles: EmergencyRole[];
  emergencyTeams: EmergencyTeamMember[];
  musterGroups: string[];
  installations: Installation[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [auto, setAuto] = useState(true);
  const [pending, startTransition] = useStatusTransition("Saving…", "save");
  const [showCasual, setShowCasual] = useState(false);
  // Lifeboat options: configured stations plus any already in use on board.
  const lbOptions = useMemo(() => {
    const set = new Set<string>(musterGroups);
    for (const p of people) if (p.lifeboat) set.add(p.lifeboat);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [musterGroups, people]);

  function saveLifeboat(p: PobOnboard, lifeboat: string) {
    const isVisit = p.trip_id.startsWith("visit-");
    startTransition(async () => {
      await setPersonLifeboat({
        kind: isVisit ? "visit" : "trip",
        id: isVisit ? p.trip_id.slice("visit-".length) : p.trip_id,
        lifeboat: lifeboat || null,
      });
      router.refresh();
    });
  }

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(t);
  }, [auto, router]);

  const today = new Date().toISOString().slice(0, 10);

  // Active rotation window for the emergency org: the one covering today, else
  // the most recent on record (drawn from both leader roles and team rows).
  const windows = useMemo(() => {
    const seen = new Map<string, { from: string; to: string }>();
    for (const r of [...emergencyRoles, ...emergencyTeams]) {
      const k = `${r.from_date}|${r.to_date}`;
      if (!seen.has(k)) seen.set(k, { from: r.from_date, to: r.to_date });
    }
    return [...seen.values()].sort((a, b) => b.from.localeCompare(a.from));
  }, [emergencyRoles, emergencyTeams]);
  const active = useMemo(
    () => windows.find((w) => w.from <= today && w.to >= today) ?? windows[0] ?? null,
    [windows, today],
  );
  const roles = useMemo(
    () =>
      active
        ? emergencyRoles.filter((r) => r.from_date === active.from && r.to_date === active.to)
        : [],
    [active, emergencyRoles],
  );

  const onboardIds = useMemo(
    () => new Set(people.map((p) => p.profile_id).filter(Boolean) as string[]),
    [people],
  );

  // Response teams (HLO, fire) for the active window, split into who is actually
  // on board now vs assigned-but-ashore — the board only lists on-board personnel.
  const teamBuckets = useMemo(() => {
    const map = new Map<EmergencyTeamKind, { onboard: string[]; ashore: number }>();
    for (const team of EMERGENCY_TEAMS) map.set(team, { onboard: [], ashore: 0 });
    if (active) {
      for (const m of emergencyTeams) {
        if (m.from_date !== active.from || m.to_date !== active.to) continue;
        const bucket = map.get(m.team);
        if (!bucket) continue;
        if (onboardIds.has(m.profile_id)) bucket.onboard.push(m.person_name ?? "—");
        else bucket.ashore++;
      }
    }
    for (const b of map.values()) b.onboard.sort((a, c) => a.localeCompare(c));
    return map;
  }, [emergencyTeams, active, onboardIds]);
  const hasTeams = [...teamBuckets.values()].some((b) => b.onboard.length || b.ashore);

  // Group on-board people by muster station (lifeboat); the "—" bucket collects
  // anyone without one — a safety gap worth surfacing prominently.
  const groups = useMemo(() => {
    const m = new Map<string, PobOnboard[]>();
    for (const p of people) {
      const lb = p.lifeboat || "—";
      const list = m.get(lb) ?? [];
      list.push(p);
      m.set(lb, list);
    }
    return [...m.entries()]
      .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)))
      .map(([lb, list]) => ({
        lb,
        people: list.sort((x, y) => x.name.localeCompare(y.name)),
        roles: roles.filter((r) => r.lifeboat === lb),
      }));
  }, [people, roles]);

  const visitorCount = people.filter((p) => p.category === "visitor").length;
  const noBed = people.filter((p) => !p.room_id).length;
  const stationCount = groups.filter((g) => g.lb !== "—").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
        <span className="text-base font-semibold">{people.length} on board</span>
        <span className="text-muted-foreground">· {stationCount} muster station(s)</span>
        {visitorCount > 0 && <span className="text-muted-foreground">· {visitorCount} visitor(s)</span>}
        {noBed > 0 && <span className="font-medium text-destructive">· {noBed} without a bed</span>}
        {active && (
          <span className="text-xs text-muted-foreground">Emergency org: {active.from} → {active.to}</span>
        )}
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto-refresh (30s)
        </label>
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
        <a
          href="/offshore-pob"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Printer className="h-3.5 w-3.5" /> Print roster
        </a>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowCasual((s) => !s)}>
            {showCasual ? "Close" : "Add casual visitor"}
          </Button>
        )}
      </div>

      {!readOnly && showCasual && (
        <CasualVisitorForm
          lbOptions={lbOptions}
          installations={installations}
          pending={pending}
          onSubmit={(input) =>
            startTransition(async () => {
              const res = await addCasualVisitor(input);
              if (res.ok) {
                setShowCasual(false);
                router.refresh();
              }
            })
          }
        />
      )}

      {hasTeams && (
        <div className="grid gap-3 sm:grid-cols-2">
          {EMERGENCY_TEAMS.map((team) => {
            const b = teamBuckets.get(team)!;
            return (
              <div key={team} className="rounded-lg border bg-card p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    {EMERGENCY_TEAM_LABEL[team]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.onboard.length} on board{b.ashore ? ` · ${b.ashore} ashore` : ""}
                  </span>
                </div>
                {b.onboard.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {b.onboard.map((n, i) => (
                      <span
                        key={`${n}-${i}`}
                        className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] text-green-700"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">None on board.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {people.length === 0 && !showCasual && (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          Nobody is currently on board.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.lb} className="rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className={cn("font-semibold", g.lb === "—" && "text-destructive")}>
                {g.lb === "—" ? "No muster station" : `Muster ${g.lb}`}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{g.people.length} on board</span>
            </div>

            {/* Evacuation & head-count leaders for this station (current window). */}
            {g.lb !== "—" && (
              <div className="flex flex-wrap gap-1.5 border-b bg-muted/30 px-3 py-2">
                {EMERGENCY_ORDER.map((kind) => {
                  const holder = g.roles.find((r) => r.role === kind);
                  const filled = Boolean(holder?.person_name);
                  const onBoard = holder?.profile_id ? onboardIds.has(holder.profile_id) : false;
                  return (
                    <span
                      key={kind}
                      title={EMERGENCY_ROLE_LABEL[kind] + (filled && !onBoard ? " — not on board" : "")}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        !filled && "border-dashed text-muted-foreground",
                        filled && !onBoard && "border-amber-300 bg-amber-50 text-amber-700",
                        onBoard && "border-green-300 bg-green-50 text-green-700",
                      )}
                    >
                      <span className="font-semibold">{LEADER_SHORT[kind]}</span>
                      <span>{holder?.person_name ?? "—"}</span>
                      {filled && (
                        <span
                          className={cn(
                            "ml-0.5 h-1.5 w-1.5 rounded-full",
                            onBoard ? "bg-green-500" : "bg-amber-400",
                          )}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            <ul className="divide-y">
              {g.people.map((p) => {
                const room = p.room_label
                  ? p.bed_no
                    ? `${p.room_label} · ${p.bed_no}`
                    : p.room_label
                  : null;
                const leads = g.roles.filter((r) => r.profile_id && r.profile_id === p.profile_id);
                return (
                  <li key={p.trip_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.category === "visitor" && (
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        visitor
                      </span>
                    )}
                    {leads.map((r) => (
                      <span
                        key={r.id}
                        title={EMERGENCY_ROLE_LABEL[r.role]}
                        className="shrink-0 rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700"
                      >
                        {LEADER_SHORT[r.role]}
                      </span>
                    ))}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.crew_name ?? ""}</span>
                    <span className={cn("shrink-0 text-xs", room ? "text-foreground" : "text-destructive")}>
                      {room ?? "no bed"}
                    </span>
                    {/* Manual lifeboat override — cabin drives it by default. */}
                    <select
                      value={p.lifeboat ?? ""}
                      disabled={pending || readOnly}
                      title="Set muster station manually (overrides the cabin)"
                      onChange={(e) => saveLifeboat(p, e.target.value)}
                      className="shrink-0 rounded border bg-background px-1 py-0.5 text-[11px] text-muted-foreground"
                    >
                      <option value="">LB —</option>
                      {lbOptions.map((lb) => (
                        <option key={lb} value={lb}>{lb}</option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Quick-add a casual/day visitor who is on board now, with a lifeboat. */
function CasualVisitorForm({
  lbOptions,
  installations,
  pending,
  onSubmit,
}: {
  lbOptions: string[];
  installations: Installation[];
  pending: boolean;
  onSubmit: (input: { name: string; company?: string; installationId?: string; lifeboat: string }) => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [lifeboat, setLifeboat] = useState("");
  const ready = name.trim() && lifeboat;
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="mb-2 text-sm font-medium">Casual / day visitor — on board now</p>
      <div className="flex flex-wrap items-end gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Visitor name" className={cn(field, "min-w-40")} />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className={cn(field, "min-w-36")} />
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className={field}>
          <option value="">Installation (optional)</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <select value={lifeboat} onChange={(e) => setLifeboat(e.target.value)} className={field} aria-label="Lifeboat station">
          <option value="">Lifeboat…</option>
          {lbOptions.map((lb) => (
            <option key={lb} value={lb}>{lb}</option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={pending || !ready}
          onClick={() => onSubmit({ name, company: company || undefined, installationId: installationId || undefined, lifeboat })}
        >
          Add to POB
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Counts in POB and appears in the muster roll-call at the chosen lifeboat.
      </p>
    </div>
  );
}

/** Per rotation window + muster group: evacuation & head-count role holders. */
function EmergencyRolesPanel({
  roles,
  teams,
  musterGroups,
  roster,
}: {
  roles: EmergencyRole[];
  teams: EmergencyTeamMember[];
  musterGroups: string[];
  roster: RosterEntry[];
}) {
  const { pending, error, run } = useRun();
  const today = new Date().toISOString().slice(0, 10);

  const windows = useMemo(() => {
    const seen = new Map<string, { from: string; to: string }>();
    for (const r of [...roles, ...teams]) {
      const k = r.from_date + "|" + r.to_date;
      if (!seen.has(k)) seen.set(k, { from: r.from_date, to: r.to_date });
    }
    return [...seen.values()].sort((a, b) => b.from.localeCompare(a.from));
  }, [roles, teams]);

  const [from, setFrom] = useState(windows[0]?.from ?? today);
  const [to, setTo] = useState(windows[0]?.to ?? today);

  const groups = musterGroups.length
    ? musterGroups
    : [...new Set(roles.map((r) => r.lifeboat))].sort() ;
  const people = [...roster]
    .map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const holder = (group: string, role: EmergencyRoleKind) =>
    roles.find(
      (r) => r.from_date === from && r.to_date === to && r.lifeboat === group && r.role === role,
    )?.profile_id ?? "";

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Evacuation &amp; head-count leaders per muster group, fixed for a rotation window (they stay
        the same across the crews aboard).
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-3">
        <label className="text-xs text-muted-foreground">
          Rotation from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        {windows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Existing:</span>
            {windows.map((w) => (
              <button
                key={w.from + w.to}
                onClick={() => { setFrom(w.from); setTo(w.to); }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent",
                  from === w.from && to === w.to && "ring-1 ring-primary",
                )}
              >
                {w.from} → {w.to}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No muster groups configured. Set a room&apos;s muster (Accommodation tab) first.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g} className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{g}</span>
                <span className="text-xs text-muted-foreground">muster group</span>
              </div>
              <div className="grid gap-2">
                {EMERGENCY_ORDER.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">{EMERGENCY_ROLE_LABEL[role]}</span>
                    <LazySelect
                      value={holder(g, role) || null}
                      options={people}
                      getOptionValue={(p) => p.id}
                      getOptionLabel={(p) => p.name}
                      placeholder="— none —"
                      disabled={pending || !from || !to}
                      className={cn(field, "flex-1 py-1")}
                      onChange={(v) =>
                        run(() => setEmergencyRole({ fromDate: from, toDate: to, lifeboat: g, role, profileId: v }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Response teams</p>
        <p className="text-xs text-muted-foreground">
          HLO and fire teams for this window — installation-wide, with no member limit.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {EMERGENCY_TEAMS.map((team) => {
            const members = teams.filter(
              (t) => t.from_date === from && t.to_date === to && t.team === team,
            );
            const memberIds = new Set(members.map((m) => m.profile_id));
            return (
              <div key={team} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    {EMERGENCY_TEAM_LABEL[team]}
                  </span>
                  <span className="text-xs text-muted-foreground">{members.length} member(s)</span>
                </div>
                {members.length > 0 ? (
                  <ul className="mb-2 flex flex-wrap gap-1">
                    {members.map((m) => (
                      <li
                        key={m.id}
                        className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
                      >
                        <span>{m.person_name ?? "—"}</span>
                        <button
                          disabled={pending}
                          title={`Remove ${m.person_name ?? "member"}`}
                          onClick={() => run(() => removeEmergencyTeamMember(m.id))}
                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-2 text-xs italic text-muted-foreground">No members yet.</p>
                )}
                <LazySelect
                  value={null}
                  options={people.filter((p) => !memberIds.has(p.id))}
                  getOptionValue={(p) => p.id}
                  getOptionLabel={(p) => p.name}
                  placeholder="— add person —"
                  disabled={pending || !from || !to}
                  className={cn(field, "w-full py-1")}
                  onChange={(v) =>
                    v && run(() => addEmergencyTeamMember({ fromDate: from, toDate: to, team, profileId: v }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {windows.some((w) => w.from === from && w.to === to) && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm(`Clear all muster roles for ${from} → ${to}?`))
              run(() => deleteEmergencyWindow(from, to));
          }}
        >
          Clear this window
        </Button>
      )}
    </div>
  );
}

type MusterDrillSummary = {
  id: string;
  started_at: string;
  ended_at: string | null;
  kind: string;
  total: number;
  accounted: number;
};

/** Past roll-calls (archive) with links to each report. */
function MusterArchive({ history }: { history: MusterDrillSummary[] }) {
  const past = history.filter((d) => d.ended_at);
  if (past.length === 0) return null;
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">Past roll-calls</div>
      <ul className="divide-y text-sm">
        {past.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
            <span className="font-medium">
              {new Date(d.started_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                d.kind === "real" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {d.kind === "real" ? "Emergency" : "Drill"}
            </span>
            <span className={cn("text-xs", d.accounted < d.total ? "text-destructive" : "text-green-700")}>
              {d.accounted}/{d.total} accounted
            </span>
            <a
              href={`/offshore-muster/${d.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
            >
              <FileText className="h-3.5 w-3.5" /> Report
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live emergency muster roll-call: tick off who's accounted per muster group. */
function MusterDrillPanel({
  drill,
  history,
  emergencyTeams,
}: {
  drill: MusterDrill | null;
  history: MusterDrillSummary[];
  emergencyTeams: EmergencyTeamMember[];
}) {
  const { pending, error, run } = useRun();
  const [elapsed, setElapsed] = useState("00:00");

  // HLO / fire-team members among this roll-call's POB snapshot, with their live
  // accounted state — during an emergency the OIM needs to see at a glance
  // whether the response teams themselves are mustered.
  const teamStatus = useMemo(() => {
    if (!drill) return [];
    const today = new Date().toISOString().slice(0, 10);
    const windows = [...new Map(
      emergencyTeams.map((m) => [`${m.from_date}|${m.to_date}`, { from: m.from_date, to: m.to_date }]),
    ).values()].sort((a, b) => b.from.localeCompare(a.from));
    const active = windows.find((w) => w.from <= today && w.to >= today) ?? windows[0] ?? null;
    if (!active) return [];
    const byProfile = new Map(
      drill.checkins.filter((c) => c.profile_id).map((c) => [c.profile_id as string, c]),
    );
    return EMERGENCY_TEAMS.map((team) => {
      const members = emergencyTeams.filter(
        (m) => m.team === team && m.from_date === active.from && m.to_date === active.to,
      );
      const onboard = members
        .flatMap((m) => {
          const c = byProfile.get(m.profile_id);
          return c ? [{ name: m.person_name ?? c.name, accounted: c.accounted, checkinId: c.id }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return { team, onboard, ashore: members.length - onboard.length };
    }).filter((t) => t.onboard.length > 0 || t.ashore > 0);
  }, [drill, emergencyTeams]);

  useEffect(() => {
    if (!drill) return;
    const start = new Date(drill.started_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [drill]);

  if (!drill) {
    return (
      <div className="space-y-3">
        {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
        <p className="text-sm text-muted-foreground">
          Start a roll-call to snapshot everyone on board and check them off at their muster station.
        </p>
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => run(() => startMusterDrill("drill"))}>
            <Siren className="h-4 w-4" /> Start drill roll-call
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (confirm("Start a REAL emergency roll-call?")) run(() => startMusterDrill("real"));
            }}
          >
            Real emergency
          </Button>
        </div>
        <MusterArchive history={history} />
      </div>
    );
  }

  const groups = new Map<string, typeof drill.checkins>();
  for (const c of drill.checkins) {
    const g = c.lifeboat || "Unassigned";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const total = drill.checkins.length;
  const accounted = drill.checkins.filter((c) => c.accounted).length;
  const unaccounted = total - accounted;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border p-3",
          drill.kind === "real" ? "border-destructive bg-destructive/5" : "bg-card",
        )}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Siren className={cn("h-4 w-4", drill.kind === "real" && "text-destructive")} />
          {drill.kind === "real" ? "EMERGENCY roll-call" : "Drill roll-call"}
        </span>
        <span className="font-mono text-lg tabular-nums">{elapsed}</span>
        <span className="text-sm">
          <span className="font-semibold text-green-700">{accounted}</span> accounted ·{" "}
          <span className={cn("font-semibold", unaccounted > 0 ? "text-destructive" : "text-muted-foreground")}>
            {unaccounted}
          </span>{" "}
          unaccounted · {total} POB
        </span>
        <a
          href={`/offshore-muster/${drill.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </a>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm("End this roll-call?")) run(() => endMusterDrill(drill.id));
          }}
        >
          End roll-call
        </Button>
      </div>

      {/* Emergency response teams on board — checked off from the same roll-call. */}
      {teamStatus.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {teamStatus.map(({ team, onboard, ashore }) => {
            const acc = onboard.filter((m) => m.accounted).length;
            return (
              <div
                key={team}
                className={cn(
                  "rounded-lg border p-3",
                  team === "fire_team" ? "border-red-200 bg-red-50/50" : "border-sky-200 bg-sky-50/50",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                      team === "fire_team" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800",
                    )}
                  >
                    <Siren className="h-3 w-3" />
                    {EMERGENCY_TEAM_LABEL[team]} on board
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {acc}/{onboard.length} accounted{ashore > 0 ? ` · ${ashore} ashore` : ""}
                  </span>
                </div>
                {onboard.length === 0 ? (
                  <p className="text-sm font-medium text-destructive">
                    Nobody from this team is on board.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {onboard.map((m) => (
                      <li key={m.checkinId}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => setMusterCheckin(m.checkinId, !m.accounted))}
                          title={m.accounted ? "Accounted — click to undo" : "Unaccounted — click to check off"}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-medium",
                            m.accounted
                              ? "border-green-200 bg-green-100 text-green-900 line-through"
                              : "bg-background hover:bg-accent",
                          )}
                        >
                          {m.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {[...groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([g, people]) => {
            const acc = people.filter((p) => p.accounted).length;
            return (
              <div key={g} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{g}</span>
                  <span className="text-xs text-muted-foreground">
                    {acc}/{people.length} accounted
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {people.map((p) => (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm",
                          p.accounted ? "bg-green-50 text-green-900" : "hover:bg-accent",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={p.accounted}
                          disabled={pending}
                          onChange={(e) => run(() => setMusterCheckin(p.id, e.target.checked))}
                        />
                        <span className={cn(p.accounted && "line-through opacity-70")}>{p.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
      </div>

      <MusterArchive history={history} />
    </div>
  );
}

const MANIFEST_STYLE: Record<ManifestStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-accent text-accent-foreground",
  locked: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

/** Build a manifest: pick mode + date, then move passengers from left to right. */

/** Adapt roster rows for lib/offshore/people. */
function rosterInfo(roster: RosterEntry[]) {
  return roster.map((m) => ({
    profile_id: m.profile_id,
    name: m.full_name || m.email,
    crew_id: m.crew_id,
    crew_name: m.crew_name,
    company: m.company,
    travel_eligible: m.travel_eligible,
  }));
}

function ManifestBuilder({
  crews,
  roster,
  employees,
  onboard,
  visits,
  pending,
  run,
}: {
  crews: Crew[];
  roster: RosterEntry[];
  /** Every active profile — going offshore is not limited to the roster. */
  employees: AssignableEmployee[];
  onboard: PobBreakdown["people"];
  visits: VisitRequest[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [mode, setMode] = useState<"helicopter" | "boat">("boat");
  const [crewId, setCrewId] = useState("");
  const [date, setDate] = useState("");
  const [seats, setSeats] = useState(24);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ManifestCandidate[]>([]);

  const pickedKeys = new Set(picked.map((p) => p.key));

  const aboardIds = useMemo(
    () => new Set(onboard.map((o) => o.profile_id).filter(Boolean) as string[]),
    [onboard],
  );

  // Everyone who may travel — the directory, enriched by the roster. Anyone
  // barred by travel_eligible is excluded; a missing roster row is not a bar.
  const people = useMemo(() => offshorePeople(employees, rosterInfo(roster)), [employees, roster]);

  // Everyone is selectable in either direction — real crew changes carry late
  // additions and people already in place. The direction only decides whether a
  // pick also changes their status, which is confirmed before it happens.
  const allCandidates = useMemo(
    () =>
      manifestCandidates({
        direction,
        roster: people,
        onboard: onboard.map((o) => ({ profile_id: o.profile_id, crew_id: o.crew_id })),
        visits: visits.map((v) => ({ id: v.id, visitor_name: v.visitor_name, status: v.status })),
      }),
    [direction, people, onboard, visits],
  );

  const candidates = allCandidates
    .filter((c) => !crewId || c.crew_id === crewId)
    .filter((c) => !pickedKeys.has(c.key))
    .filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));

  // What creating this manifest would do to the people on it.
  const movements = pendingMovements(picked, direction);
  const movementCount = movements.board.length + movements.offboard.length;

  // Everyone the schedule says should travel on this date and direction: the
  // rotation cycle decides the crews, the bookings decide the visitors. See
  // lib/offshore/manifest-plan.ts — the rules are unit-tested there.
  const plan = useMemo(
    () =>
      planManifest({
        direction,
        dateIso: date,
        crewIdFilter: crewId || null,
        crews: crews.map((c) => ({
          id: c.id,
          name: c.name,
          offshore_days: c.offshore_days,
          onshore_days: c.onshore_days,
          cycle_start_date: c.cycle_start_date,
        })),
        roster: roster.map((m) => ({
          profile_id: m.profile_id,
          name: m.full_name || m.email,
          crew_id: m.crew_id,
          is_rotational: m.is_rotational,
        })),
        onboard: onboard.map((o) => ({
          profile_id: o.profile_id,
          name: o.name,
          crew_id: o.crew_id,
        })),
        visits: visits.map((v) => ({
          id: v.id,
          visitor_name: v.visitor_name,
          status: v.status,
          depart_date: v.depart_date,
          return_date: v.return_date,
        })),
      }),
    [direction, date, crewId, crews, roster, onboard, visits],
  );

  // Pre-fill whenever the planning inputs change. Everyone the schedule returns
  // goes on — an overbooked run is flagged below rather than trimmed, so the
  // operator decides who moves. They can still add or remove anyone by hand.
  const planKey = `${direction}|${date}|${crewId}|${plan.picks.map((p) => p.kind + p.id).join(",")}`;
  const appliedKey = useRef<string | null>(null);
  useEffect(() => {
    if (appliedKey.current === planKey) return;
    appliedKey.current = planKey;
    setPicked(planPicksAsCandidates(plan.picks, allCandidates, direction, aboardIds));
  }, [planKey, plan.picks, allCandidates, direction, aboardIds]);

  const reasonFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plan.picks) m.set((p.kind === "staff" ? "s" : "v") + p.id, p.reason);
    return m;
  }, [plan.picks]);

  const setModeAndSeats = (m: "helicopter" | "boat") => {
    setMode(m);
    setSeats(m === "boat" ? 24 : 12);
  };
  const reset = () => {
    setPicked([]);
    setDate("");
    setSearch("");
  };
  function submit() {
    // Creating the manifest can also move people. Say exactly who, and let the
    // operator create it without the movements if that is not what they meant.
    let applyMovements = false;
    if (movementCount > 0) {
      const what = movements.board.length
        ? `mobilise ${movements.board.length} person(s) who are ashore`
        : `demobilise ${movements.offboard.length} person(s) who are on board`;
      applyMovements = confirm(
        `This manifest will also ${what}, changing POB, the muster roll and catering counts.\n\n` +
          `${[...movements.board, ...movements.offboard].map((p) => `• ${p.name}`).join("\n")}\n\n` +
          `OK to create and apply. Cancel to create the manifest only.`,
      );
    }
    run(
      () =>
        createManifest({
          crewId: crewId || null,
          direction,
          transportMode: mode,
          scheduledDate: date,
          seatCapacity: seats,
          profileIds: picked.filter((p) => p.kind === "staff").map((p) => p.id),
          visitRequestIds: picked.filter((p) => p.kind === "visitor").map((p) => p.id),
          applyMovements,
        }),
      reset,
    );
  }

  const seatCheck = seatOverflow(picked.length, seats);
  const over = seatCheck.over;

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-card/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in")} className={cn(field, "mt-0.5 block py-1")}>
            <option value="out">Going offshore — joining (mobilise)</option>
            <option value="in">Coming ashore — leaving (demobilise)</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Mode
          <select value={mode} onChange={(e) => setModeAndSeats(e.target.value as "helicopter" | "boat")} className={cn(field, "mt-0.5 block py-1")}>
            <option value="helicopter">Helicopter</option>
            <option value="boat">Boat</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Crew (filter)
          <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={cn(field, "mt-0.5 block py-1")}>
            <option value="">All crews</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || plan.picks.length === 0}
          title={
            plan.picks.length
              ? "Put back everyone the rotation schedule says is due on this date"
              : "Nothing is scheduled for this date and direction"
          }
          onClick={() =>
            setPicked(planPicksAsCandidates(plan.picks, allCandidates, direction, aboardIds))
          }
        >
          Fill from schedule ({plan.picks.length})
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !crewId}
          title={
            crewId
              ? "Add every member of this crew on the right side of the change"
              : "Pick a crew first"
          }
          onClick={() => {
            const fill = crewFill(allCandidates, crewId, direction);
            setPicked((cur) => {
              const have = new Set(cur.map((p) => p.key));
              return [...cur, ...fill.filter((c) => !have.has(c.key))];
            });
          }}
        >
          Add entire crew
        </Button>
        <label className="text-xs text-muted-foreground">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Seats
          <input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value) || 1)} className={cn(field, "mt-0.5 block w-20 py-1")} />
        </label>
      </div>

      {/* What the schedule produced for this date + direction. */}
      {!date ? (
        <p className="text-[11px] text-muted-foreground">
          Pick a date to pre-fill the manifest from the rotation schedule and the visitor bookings.
        </p>
      ) : plan.scheduledCrews.length > 0 && plan.picks.length === 0 ? (
        // The crew's cycle turns on this date but there is nobody to move: on a
        // leaving run none of them are aboard, on a joining run they all are.
        // Saying "pre-filled" over an empty list reads as a broken schedule.
        <p className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium">
            {plan.scheduledCrews.map((c) => c.name).join(", ")}
          </span>{" "}
          {direction === "out" ? "is due offshore" : "is due ashore"} on {date}, but nobody was added:{" "}
          {direction === "out"
            ? "every member is already on board."
            : "none of its members are on board."}{" "}
          Add anyone you need from the list below.
        </p>
      ) : plan.scheduledCrews.length > 0 || plan.picks.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Pre-filled from the schedule:{" "}
          {plan.scheduledCrews.length > 0 ? (
            <>
              <span className="font-medium">
                {plan.scheduledCrews.map((c) => c.name).join(", ")}
              </span>{" "}
              {direction === "out" ? "due offshore" : "due ashore"}
            </>
          ) : (
            "no crew change"
          )}
          {plan.picks.some((p) => p.kind === "visitor") &&
            `, plus ${plan.picks.filter((p) => p.kind === "visitor").length} booked visitor(s)`}
          . Everyone due is listed — add or remove anyone before creating, from either side of the
          change.
        </p>
      ) : (
        <p className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
          Nothing is scheduled to move on {date}
          {crewId ? " for this crew" : ""}.
          {plan.nearest.length > 0 && (
            <>
              {" "}
              Nearest{" "}
              {direction === "out" ? "departures" : "returns"}:{" "}
              {plan.nearest.map((n) => `${n.crewName} ${n.dateIso}`).join(" · ")}.
            </>
          )}{" "}
          You can still build the movement by hand.
        </p>
      )}

      {movementCount > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          Creating this manifest will also{" "}
          {movements.board.length > 0 && <strong>mobilise {movements.board.length}</strong>}
          {movements.offboard.length > 0 && <strong>demobilise {movements.offboard.length}</strong>}{" "}
          person(s) — POB, the muster roll and catering counts change with it. You will be asked to
          confirm, and can still create the manifest without moving anyone.
        </p>
      )}

      {/* Overbooking is surfaced, never silently trimmed. */}
      {over && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] font-medium text-destructive">
          Overbooked by {seatCheck.excess} — {picked.length} passenger(s) for {seats} seat(s). Everyone
          scheduled is still listed: add a run, raise the seat count, or take people off before creating.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {/* Available */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-2 py-1">
            <span className="text-xs font-semibold">Available ({candidates.length})</span>
            <button
              type="button"
              disabled={pending || candidates.length === 0}
              onClick={() => setPicked((cur) => [...cur, ...candidates])}
              className="text-[11px] text-primary hover:underline disabled:opacity-50"
            >
              Add all
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full border-b px-2 py-1 text-xs outline-none"
          />
          <ul className="max-h-64 overflow-y-auto p-1">
            {candidates.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setPicked((cur) => [...cur, c])}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <span>{c.name}</span>
                  <span className="text-muted-foreground">+</span>
                </button>
              </li>
            ))}
            {candidates.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">No one to add.</li>}
          </ul>
        </div>

        {/* Selected */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-2 py-1">
            <span className={cn("text-xs font-semibold", over && "text-destructive")}>
              Manifest ({picked.length}/{seats}){over ? " · over capacity" : ""}
            </span>
            <button
              type="button"
              disabled={pending || picked.length === 0}
              onClick={() => setPicked([])}
              className="text-[11px] text-muted-foreground hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {picked.map((p, i) => (
              <li key={p.key}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setPicked((cur) => cur.filter((x) => x.key !== p.key))}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-destructive/10"
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "mr-1 tabular-nums",
                        // Everyone past the seat count is still listed; number
                        // them in red so the overflow is obvious at a glance.
                        i >= seats ? "font-semibold text-destructive" : "text-muted-foreground/70",
                      )}
                    >
                      {i + 1}.
                    </span>
                    {p.name}
                    {reasonFor.has(p.key) && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        · {reasonFor.get(p.key)}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">×</span>
                </button>
              </li>
            ))}
            {picked.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">Click people on the left to add.</li>}
          </ul>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled={pending || !date || picked.length === 0} onClick={submit}>
          Create manifest ({picked.length})
        </Button>
      </div>
    </div>
  );
}

function ManifestsPanel({
  manifests,
  crews,
  roster,
  employees,
  onboard,
  visits,
}: {
  manifests: Manifest[];
  crews: Crew[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  onboard: PobBreakdown["people"];
  visits: VisitRequest[];
}) {
  const { pending, error, run } = useRun();

  const active = manifests.filter((m) => m.status !== "completed" && m.status !== "cancelled");
  const history = manifests.filter((m) => m.status === "completed" || m.status === "cancelled");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <ManifestBuilder
        crews={crews}
        roster={roster}
        employees={employees}
        onboard={onboard}
        visits={visits}
        pending={pending}
        run={run}
      />

      <div className="space-y-3">
        {active.map((m) => (
          <ManifestCard key={m.id} m={m} pending={pending} run={run} />
        ))}
        {active.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No active or upcoming manifests.
          </p>
        )}
      </div>

      <ManifestHistory history={history} crews={crews} pending={pending} run={run} />
    </div>
  );
}

/** Collapsible archive of completed & cancelled manifests, with filters. */
function ManifestHistory({
  history,
  crews,
  pending,
  run,
}: {
  history: Manifest[];
  crews: Crew[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "cancelled">("all");
  const [crewId, setCrewId] = useState("");

  const filtered = history
    .filter((m) => status === "all" || m.status === status)
    .filter((m) => !crewId || m.crew_id === crewId)
    .filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      // Search what is shown — "mob", "demob", "helicopter", the route — not the
      // stored title, which the card no longer displays.
      return (
        manifestDescriptor(m).summary.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        (m.installation_name ?? "").toLowerCase().includes(q) ||
        (m.crew_name ?? "").toLowerCase().includes(q) ||
        m.scheduled_date.includes(q)
      );
    });

  const csvHref =
    "/offshore-export?type=manifest-history" +
    (status !== "all" ? `&status=${status}` : "") +
    (crewId ? `&crew=${crewId}` : "");

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
      >
        <History className="h-4 w-4 text-muted-foreground" />
        History
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {history.length}
        </span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t p-3">
          {history.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-muted-foreground">
              No completed or cancelled manifests yet.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, crew, installation, date…"
                  className={cn(field, "min-w-[14rem] flex-1 py-1")}
                />
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={cn(field, "py-1")}>
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={cn(field, "py-1")}>
                  <option value="">All crews</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <a
                  href={csvHref}
                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <FileText className="h-3.5 w-3.5" /> Export CSV
                </a>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Showing {filtered.length} of {history.length}
              </p>

              <div className="space-y-3">
                {filtered.map((m) => (
                  <ManifestCard key={m.id} m={m} pending={pending} run={run} />
                ))}
                {filtered.length === 0 && (
                  <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
                    No manifests match your filters.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ManifestCard({
  m,
  pending,
  run,
}: {
  m: Manifest;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const travelling = m.pax.filter((p) => !p.no_show);
  const overCapacity = travelling.length > m.seat_capacity;
  const issues = travelling.filter((p) => p.issues.length > 0).length;
  const editable = m.status === "draft" || m.status === "approved";
  const canEditTransport = m.status !== "completed" && m.status !== "cancelled";

  // Derived from the manifest's own columns: the stored title was baked by more
  // than one code path and contradicts the data on some rows.
  const desc = manifestDescriptor(m);

  const [editingTransport, setEditingTransport] = useState(false);
  const [editMode, setEditMode] = useState<"helicopter" | "boat">(
    m.transport_mode === "helicopter" ? "helicopter" : "boat",
  );
  const [editSeats, setEditSeats] = useState(m.seat_capacity);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", MANIFEST_STYLE[m.status])}>
          {MANIFEST_STATUS_LABEL[m.status]}
        </span>
        {m.crew_name && <span className="font-medium">{m.crew_name}</span>}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-semibold",
            desc.movement === "MOB"
              ? "bg-green-100 text-green-800"
              : "bg-blue-100 text-blue-800",
          )}
          title={desc.movementLong}
        >
          {desc.movement}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {desc.transport}
        </span>
        <span className="text-xs text-muted-foreground">{desc.route}</span>
        <span className="text-xs font-medium tabular-nums">{desc.date}</span>
        <span className={cn("ml-auto text-xs", overCapacity ? "font-medium text-destructive" : "text-muted-foreground")}>
          {travelling.length}/{m.seat_capacity} seats
        </span>
        {canEditTransport && !editingTransport && (
          <button
            type="button"
            onClick={() => setEditingTransport(true)}
            className="rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
          >
            Seats / transport
          </button>
        )}
        <a
          href={`/offshore-manifest/${m.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </a>
      </div>

      {editingTransport && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-card/50 p-2">
          <label className="text-[11px] text-muted-foreground">
            Transport
            <select
              value={editMode}
              onChange={(e) => {
                const mode = e.target.value as "helicopter" | "boat";
                setEditMode(mode);
                setEditSeats(mode === "boat" ? 24 : 12);
              }}
              className={cn(field, "mt-0.5 block py-1")}
            >
              <option value="boat">Boat</option>
              <option value="helicopter">Helicopter</option>
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">
            Seats
            <input
              type="number"
              min={1}
              value={editSeats}
              onChange={(e) => setEditSeats(Number(e.target.value) || 1)}
              className={cn(field, "mt-0.5 block w-20 py-1")}
            />
          </label>
          {editSeats < travelling.length && (
            <span className="text-[11px] text-destructive">Below the {travelling.length} travelling.</span>
          )}
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => updateManifestTransport({ id: m.id, transportMode: editMode, seatCapacity: editSeats }),
                () => setEditingTransport(false),
              )
            }
          >
            Save
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditingTransport(false)}>
            Cancel
          </Button>
        </div>
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        {m.installation_name ?? "—"} · {m.scheduled_date}
        {m.transport_mode ? ` · ${m.transport_mode}` : ""}
        {issues > 0 ? ` · ${issues} eligibility issue(s)` : ""}
      </p>

      <div className="mt-2 space-y-1">
        {m.pax.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-sm",
              p.no_show && "opacity-50",
            )}
          >
            <span className={cn(p.no_show && "line-through")}>{p.person_name}</span>
            {p.position && <span className="text-xs text-muted-foreground">{p.position}</span>}
            {p.boarded && <span className="text-[11px] text-green-700">boarded</span>}
            {p.issues.length > 0 && (
              <span className="rounded bg-destructive/10 px-1.5 text-[11px] text-destructive">
                {p.issues.join(", ")}
              </span>
            )}
            {editable && (
              <span className="ml-auto flex gap-1">
                <button
                  disabled={pending}
                  onClick={() => run(() => togglePaxNoShow(p.id, !p.no_show))}
                  className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                >
                  {p.no_show ? "Travelling" : "No-show"}
                </button>
                <button
                  disabled={pending}
                  onClick={() => run(() => removeManifestPax(p.id))}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
            {m.status === "completed" && !p.no_show && (
              <button
                disabled={pending}
                title="Reverse this person if the journey didn't complete"
                onClick={() => {
                  const msg =
                    m.direction === "out"
                      ? `${p.person_name} did not arrive at the installation? They'll be taken back off POB.`
                      : `${p.person_name} stayed aboard (didn't reach shore)? They'll be put back on POB.`;
                  if (confirm(msg)) run(() => reverseManifestPax({ paxId: p.id }));
                }}
                className="ml-auto rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                {m.direction === "out" ? "Did not arrive" : "Returned aboard"}
              </button>
            )}
          </div>
        ))}
        {m.pax.length === 0 && <p className="text-xs text-muted-foreground">No passengers.</p>}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {m.status !== "completed" && m.status !== "cancelled" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              const verb = m.direction === "out" ? "board (mobilise)" : "demob (offboard)";
              if (confirm(`Approve this manifest? ${travelling.length} passenger(s) will be ${verb}.`))
                run(() => confirmManifestMovement(m.id));
            }}
          >
            Approve &amp; {m.direction === "out" ? "board" : "demob"}
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setManifestStatus(m.id, "cancelled"))}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

const VISIT_STYLE: Record<VisitStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  approved: "bg-accent text-accent-foreground",
  rejected: "bg-destructive/10 text-destructive line-through",
  onboard: "bg-primary/10 text-primary",
  returned: "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

/** Group visit requests by their shared group_id (legacy single requests stand alone). */
function groupVisits(list: VisitRequest[]): VisitRequest[][] {
  const map = new Map<string, VisitRequest[]>();
  const order: string[] = [];
  for (const v of list) {
    const k = v.group_id ?? v.id;
    if (!map.has(k)) {
      map.set(k, []);
      order.push(k);
    }
    map.get(k)!.push(v);
  }
  return order.map((k) => map.get(k)!);
}

function VisitorsPanel({ visits }: { visits: VisitRequest[] }) {
  const { pending, error, run } = useRun();
  const open = visits.filter((v) => !["returned", "rejected", "cancelled"].includes(v.status));
  const closed = visits.filter((v) => ["returned", "rejected", "cancelled"].includes(v.status));

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">No active visitor requests.</p>
      )}
      <div className="space-y-3">
        {groupVisits(open).map((g) => {
          const head = g[0];
          const grouped = g.length > 1 || head.group_id != null;
          const pendingDecision = head.status === "requested";
          return (
            <div key={head.group_id ?? head.id} className={cn(grouped && "rounded-lg border bg-card/50 p-2")}>
              {grouped && (
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                  <span className="text-sm font-medium">
                    {g.length} visitor(s) · {head.purpose ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {head.installation_name ?? "—"} · {head.depart_date}
                    {head.host_name ? ` · host ${head.host_name}` : ""}
                  </span>
                  {pendingDecision && (
                    <span className="ml-auto flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            head.group_id
                              ? decideVisitGroup(head.group_id, "approved")
                              : decideVisitRequest(head.id, "approved"),
                          )
                        }
                      >
                        Approve request
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          const reason = prompt("Reason for rejection?") ?? undefined;
                          run(() =>
                            head.group_id
                              ? decideVisitGroup(head.group_id, "rejected", reason)
                              : decideVisitRequest(head.id, "rejected", reason),
                          );
                        }}
                      >
                        Reject
                      </Button>
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-3">
                {g.map((v) => (
                  <VisitorCard key={v.id} v={v} pending={pending} run={run} hideDecision={grouped} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {closed.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">History ({closed.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {closed.map((v) => (
              <li key={v.id}>
                {v.visitor_name} · {v.installation_name ?? "—"} · {VISIT_STATUS_LABEL[v.status]}
                {v.depart_date ? ` · ${v.depart_date}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function VisitorCard({
  v,
  pending,
  run,
  hideDecision,
}: {
  v: VisitRequest;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
  hideDecision?: boolean;
}) {
  const [rooms, setRooms] = useState<RoomAvailability[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function search() {
    setSearchError(null);
    setSearching(true);
    const res = await findAvailableBeds({
      installationId: v.installation_id ?? "",
      from: v.depart_date,
      to: v.return_date || v.depart_date,
      gender: v.gender,
    });
    setSearching(false);
    if (!res.ok) setSearchError(res.error ?? "Search failed.");
    else setRooms(res.rooms ?? []);
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", VISIT_STYLE[v.status])}>
          {VISIT_STATUS_LABEL[v.status]}
        </span>
        <span className="font-medium">{v.visitor_name}</span>
        <span className="text-xs text-muted-foreground">
          {VISITOR_TYPE_LABEL[v.visitor_type]}
          {v.visitor_company ? ` · ${v.visitor_company}` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {v.installation_name ?? "—"} · {v.depart_date}
          {v.return_date ? ` → ${v.return_date}` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {v.purpose ? `${v.purpose} · ` : ""}
        {v.host_name ? `Host ${v.host_name} ` : ""}
        {v.host_department ? `(${v.host_department}) · ` : ""}
        {v.accommodation_required ? "Overnight" : "Day trip"}
        {v.emergency_contact ? ` · ICE ${v.emergency_contact}` : ""}
      </p>
      {v.allocation && (
        <p className="mt-1 text-sm">
          Room: <span className="font-medium">{v.allocation.room_label}</span> ·{" "}
          {v.allocation.from_date} → {v.allocation.to_date} ({v.allocation.status})
        </p>
      )}
      {v.status === "rejected" && v.reject_reason && (
        <p className="mt-1 text-xs text-destructive">{v.reject_reason}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {v.status === "requested" && !hideDecision && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => decideVisitRequest(v.id, "approved"))}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const reason = prompt("Reason for rejection?") ?? undefined;
                run(() => decideVisitRequest(v.id, "rejected", reason));
              }}
            >
              Reject
            </Button>
          </>
        )}
        {(v.status === "approved" || v.status === "onboard") && v.accommodation_required && (
          <Button size="sm" variant="outline" disabled={searching} onClick={search}>
            {searching ? "Searching…" : v.allocation ? "Change room" : "Find a bed"}
          </Button>
        )}
        {v.status === "approved" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setVisitorMovement(v.id, "onboard"))}>
            Confirm offshore arrival
          </Button>
        )}
        {v.status === "onboard" && (
          <Button size="sm" disabled={pending} onClick={() => run(() => setVisitorMovement(v.id, "returned"))}>
            Confirm return onshore
          </Button>
        )}
      </div>

      {searchError && <p className="mt-2 text-xs text-destructive">{searchError}</p>}
      {rooms && (
        <div className="mt-2 rounded-md border p-2">
          {rooms.length === 0 ? (
            <p className="text-xs text-muted-foreground">No free beds for the full stay.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => (
                <button
                  key={r.room_id}
                  disabled={pending}
                  onClick={() =>
                    run(() => allocateVisitorBed({ visitRequestId: v.id, roomId: r.room_id }), () =>
                      setRooms(null),
                    )
                  }
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  {r.label} · {r.free_beds} free
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "green";
  /** When set, the card becomes a button that opens its detail drill-down. */
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className={cn("text-2xl font-semibold", tone === "green" && "text-green-700")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </>
  );
  const base = cn(
    "rounded-lg border bg-card p-3 text-left",
    tone === "green" && "border-green-300 bg-green-50",
  );
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show details"
      className={cn(base, "transition-colors hover:border-primary/50 hover:bg-accent", active && "ring-1 ring-primary")}
    >
      {body}
    </button>
  );
}

function DrillCard({
  title,
  onClose,
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  onClose: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-2 rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
          )}
          <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">{children}</div>
    </div>
  );
}

/** Compact rows for a list of on-board people in a stat drill-down. */
function PobPeopleRows({ people }: { people: PobOnboard[] }) {
  if (people.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <>
      {[...people]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => (
          <div key={p.trip_id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
            <span className="font-medium">{p.name}</span>
            {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] capitalize text-muted-foreground">{p.category}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {p.crew_name ?? "—"} · {p.room_label ?? "no bed"}{p.bed_no ? ` · ${p.bed_no}` : ""}{p.lifeboat ? ` · ${p.lifeboat}` : ""}
            </span>
          </div>
        ))}
    </>
  );
}

/** Compact rows for a list of rooms in a stat drill-down. */
function RoomRows({ rooms, showFree }: { rooms: Room[]; showFree?: boolean }) {
  if (rooms.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  const labelOf = (r: Room) => [r.block, r.room_number].filter(Boolean).join(" ") || "—";
  return (
    <>
      {[...rooms]
        .sort((a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { numeric: true }))
        .map((r) => {
          const free = Math.max(0, (r.bed_count || 0) - r.occupied);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className="font-medium">{labelOf(r)}</span>
              <span className="text-xs text-muted-foreground">{r.installation_name ?? "—"}</span>
              {r.status !== "available" && (
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{ROOM_STATUS_LABEL[r.status]}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {showFree ? `${free} free · ` : ""}{r.occupied}/{r.bed_count || 0}
              </span>
            </div>
          );
        })}
    </>
  );
}

/** Rows for roster members with a fixed cabin. */
function FixedCabinRows({ roster }: { roster: RosterEntry[] }) {
  const fixed = roster.filter((m) => m.fixed_room_id);
  if (fixed.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <>
      {[...fixed]
        .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email))
        .map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
            <span className="font-medium">{m.full_name || m.email}</span>
            {m.crew_name && <span className="text-xs text-muted-foreground">{m.crew_name}</span>}
            <span className="ml-auto text-xs text-muted-foreground">
              {m.fixed_room_label ?? "—"}{m.fixed_bed ? ` · ${m.fixed_bed}` : ""}
            </span>
          </div>
        ))}
    </>
  );
}

/** Rows for the overstayer list (past planned return). */
function OverstayerRows({ list }: { list: PobBreakdown["overstayers"] }) {
  if (list.length === 0) return <p className="py-1 text-xs text-muted-foreground">None.</p>;
  return (
    <>
      {list.map((o, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
          <span className="font-medium">{o.name}</span>
          <span className="text-xs text-muted-foreground">{o.installation ?? "—"}</span>
          <span className="ml-auto text-xs text-amber-700">due {o.demob_date}</span>
        </div>
      ))}
    </>
  );
}

/** Parse a rotation pattern like "28/28" or "28" into offshore/onshore day counts. */
function parsePattern(pattern: string, start: string, end: string): { off: number; on: number } | null {
  const parts = pattern.split("/").map((n) => parseInt(n.trim(), 10));
  if (parts[0] > 0) {
    const off = parts[0];
    const on = parts[1] > 0 ? parts[1] : off;
    return { off, on };
  }
  // No pattern: derive offshore length from the start/end dates (onshore = same).
  if (start && end) {
    const days = Math.round(
      (new Date(end + "T00:00:00Z").getTime() - new Date(start + "T00:00:00Z").getTime()) / 86400000,
    ) + 1;
    if (days > 0) return { off: days, on: days };
  }
  return null;
}

/** Shared cycle-start + pattern form that auto-groups people into a crew. */
function RotationForm({
  profileIds,
  label,
  onDone,
}: {
  profileIds: string[];
  label: string;
  onDone?: () => void;
}) {
  const { pending, error, run } = useRun();
  const [start, setStart] = useState("");
  const [pattern, setPattern] = useState("28/28");
  const [end, setEnd] = useState("");

  function apply() {
    const parsed = parsePattern(pattern, start, end);
    if (!start || !parsed) return;
    run(
      () =>
        autoAssignBySchedule({
          profileIds,
          offshoreDays: parsed.off,
          onshoreDays: parsed.on,
          cycleStartDate: start,
          autoName: true,
        }),
      onDone,
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed bg-card/50 p-2 text-xs">
      <label className="text-muted-foreground">
        Cycle start
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
      </label>
      <label className="text-muted-foreground">
        Recurring (off/on)
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="28/28" className={cn(field, "mt-0.5 block w-24 py-1")} />
      </label>
      <label className="text-muted-foreground">
        End shift (opt.)
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
      </label>
      <Button size="sm" disabled={pending || !start || !profileIds.length} onClick={apply}>
        {label}
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}

/** Top-of-list bulk control: apply one rotation to every unassigned person. */
function BulkSchedule({ profileIds }: { profileIds: string[] }) {
  const [open, setOpen] = useState(false);
  if (!profileIds.length) return null;
  return (
    <div className="mb-2 border-b pb-2">
      {open ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Apply one rotation to all {profileIds.length} unassigned (same schedule → one crew):</p>
          <RotationForm profileIds={profileIds} label={`Apply to all ${profileIds.length}`} onDone={() => setOpen(false)} />
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-primary hover:underline">
          + Apply a rotation to all {profileIds.length} at once
        </button>
      )}
    </div>
  );
}

/** One unassigned person: quick crew pick + an expandable rotation scheduler. */
function UnassignedRow({ person, crews }: { person: PobBreakdown["people"][number]; crews: Crew[] }) {
  const { pending, run } = useRun();
  const [sched, setSched] = useState(false);
  const p = person;

  return (
    <div className="border-b py-1.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.name}</span>
        {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
        {p.room_label && (
          <span className="text-xs text-muted-foreground">
            {p.room_label}{p.bed_no ? ` · ${p.bed_no}` : ""}
          </span>
        )}
        {p.lifeboat && <span className="rounded bg-sky-100 px-1.5 text-[10px] text-sky-800">{p.lifeboat}</span>}
        {p.category === "visitor" && (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">Visitor</span>
        )}
        {p.profile_id && (
          <span className="ml-auto flex items-center gap-1">
            {p.category === "visitor" ? (
              <button
                disabled={pending}
                onClick={() => run(() => setTripCategory(p.trip_id, "staff"))}
                className="rounded border px-1.5 py-1 text-xs hover:bg-accent"
              >
                Make staff
              </button>
            ) : (
              <>
                <button
                  disabled={pending}
                  onClick={() => run(() => setTripCategory(p.trip_id, "visitor"))}
                  className="rounded border px-1.5 py-1 text-xs hover:bg-accent"
                  title="Count this person as a visitor, not crew"
                >
                  Visitor
                </button>
                <button
                  onClick={() => setSched((s) => !s)}
                  className={cn("rounded border px-1.5 py-1 text-xs hover:bg-accent", sched && "bg-accent")}
                >
                  Rotation
                </button>
                <select
                  defaultValue={p.crew_id ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => assignToCrew([p.profile_id as string], e.target.value || null))}
                  className={cn(field, "py-1 text-xs")}
                >
                  <option value="">No crew…</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            )}
          </span>
        )}
      </div>
      {sched && p.category !== "visitor" && p.profile_id && (
        <div className="mt-1.5">
          <RotationForm profileIds={[p.profile_id]} label="Schedule & assign" onDone={() => setSched(false)} />
        </div>
      )}
    </div>
  );
}

type Drill =
  | { type: "crew" | "lb" | "stat"; key: string }
  | { type: "rooms" }
  | null;

function Dashboard({
  canDecide,
  pob,
  accommodation,
  certAlerts,
  crews,
  rooms,
  roster,
  visits,
  trips,
}: {
  /** False for viewers who see the queue but cannot decide it. */
  canDecide: boolean;
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
  certAlerts: CertAlert[];
  crews: Crew[];
  rooms: Room[];
  roster: RosterEntry[];
  visits: VisitRequest[];
  trips: OffshoreTrip[];
}) {
  const { pending, error, run } = useRun();
  const [drill, setDrill] = useState<Drill>(null);

  const isOpen = (d: NonNullable<Drill>) =>
    drill?.type === d.type && ("key" in d ? "key" in drill && drill.key === d.key : true);
  const toggle = (d: NonNullable<Drill>) => setDrill((cur) => (isOpen(d) ? null : d));

  const unassigned = pob.people.filter((p) => !p.crew_id);

  // Clickable KPI cards → a detail drill-down that can be refreshed live.
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refresh = () => startRefresh(() => router.refresh());
  const today = new Date().toISOString().slice(0, 10);
  const statDrill = (key: string) => ({
    onClick: () => toggle({ type: "stat", key }),
    active: isOpen({ type: "stat", key }),
  });
  const POB_STAT_KEYS = ["pob", "staff", "visitors", "arrivals", "departures", "overstayers"];
  const blocked = (r: Room) => ["blocked", "maintenance"].includes(r.status);
  function statCard(key: string): { title: string; node: ReactNode } | null {
    switch (key) {
      case "pob":
        return { title: `On board now (${pob.total})`, node: <PobPeopleRows people={pob.people} /> };
      case "staff":
        return { title: `Offshore staff on board (${pob.byCategory.staff})`, node: <PobPeopleRows people={pob.people.filter((p) => p.category === "staff")} /> };
      case "visitors":
        return { title: `Visitors on board (${pob.byCategory.visitor})`, node: <PobPeopleRows people={pob.people.filter((p) => p.category === "visitor")} /> };
      case "arrivals":
        return { title: `Arrived today (${pob.arrivalsToday})`, node: <PobPeopleRows people={pob.people.filter((p) => p.mobilize_date === today)} /> };
      case "departures":
        return { title: `Departing today (${pob.departuresToday})`, node: <PobPeopleRows people={pob.people.filter((p) => p.demob_date === today)} /> };
      case "overstayers":
        return { title: `Overstayers (${pob.overstayers.length})`, node: <OverstayerRows list={pob.overstayers} /> };
      case "rooms":
        return { title: `Rooms (${accommodation.totalRooms})`, node: <RoomRows rooms={rooms} /> };
      case "beds":
        return { title: `Usable beds (${accommodation.totalBeds})`, node: <RoomRows rooms={rooms.filter((r) => !blocked(r))} /> };
      case "occupied":
        return { title: `Occupied — who's in a bed (${accommodation.occupiedBeds})`, node: <PobPeopleRows people={pob.people.filter((p) => p.room_id)} /> };
      case "available":
        return { title: `Rooms with a free bed (${accommodation.availableBeds} beds)`, node: <RoomRows rooms={rooms.filter((r) => !blocked(r) && Math.max(0, (r.bed_count || 0) - r.occupied) > 0)} showFree /> };
      case "fixed":
        return { title: `Fixed cabins — staff (${accommodation.fixedBeds})`, node: <FixedCabinRows roster={roster} /> };
      case "blocked":
        return { title: `Blocked / maintenance rooms (${accommodation.blockedRooms})`, node: <RoomRows rooms={rooms.filter(blocked)} /> };
      default:
        return null;
    }
  }
  const statDetail = drill?.type === "stat" ? statCard(drill.key) : null;
  const statDrillCard = (group: "pob" | "acc") =>
    drill?.type === "stat" &&
    statDetail &&
    POB_STAT_KEYS.includes(drill.key) === (group === "pob") ? (
      <DrillCard title={statDetail.title} onClose={() => setDrill(null)} onRefresh={refresh} refreshing={refreshing}>
        {statDetail.node}
      </DrillCard>
    ) : null;

  return (
    <div className="space-y-5">
      <PendingApprovals visits={visits} trips={trips} canDecide={canDecide} />
      <VisitorBookingQueue visits={visits} />
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Persons on board
          </h3>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (confirm("Start a muster roll-call for everyone on board?"))
                run(() => startMusterDrill("drill"));
            }}
          >
            <Siren className="h-4 w-4" /> Start muster roll-call
          </Button>
        </div>
        {error && <p className="mb-2 rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Current POB" value={pob.total} {...statDrill("pob")} />
          <Stat label="Offshore staff" value={pob.byCategory.staff} {...statDrill("staff")} />
          <Stat label="Visitors" value={pob.byCategory.visitor} {...statDrill("visitors")} />
          <Stat label="Arrivals today" value={pob.arrivalsToday} {...statDrill("arrivals")} />
          <Stat label="Departures today" value={pob.departuresToday} {...statDrill("departures")} />
          <Stat label="Overstayers" value={pob.overstayers.length} {...statDrill("overstayers")} />
        </div>
        {statDrillCard("pob")}
        {pob.byInstallation.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pob.byInstallation.map((i) => {
              const over = i.capacity > 0 && i.pob > i.capacity;
              return (
                <div key={i.name} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{i.name}</span>
                    <span className={cn("font-semibold", over && "text-destructive")}>
                      {i.pob}
                      {i.capacity > 0 ? ` / ${i.capacity}` : ""}
                    </span>
                  </div>
                  {i.capacity > 0 && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full", over ? "bg-destructive" : "bg-primary")}
                        style={{ width: `${Math.min(100, (i.pob / i.capacity) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {pob.byCrew.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">By crew:</span>
            {pob.byCrew.map((c) => (
              <button
                key={c.name}
                onClick={() => toggle({ type: "crew", key: c.name })}
                className={cn(
                  "rounded-full border px-2 py-0.5 font-medium hover:bg-accent",
                  c.name === "Unassigned" && "border-amber-300 bg-amber-50 text-amber-800",
                  isOpen({ type: "crew", key: c.name }) && "ring-1 ring-primary",
                )}
              >
                {c.name} · {c.pob}
              </button>
            ))}
          </div>
        )}
        {pob.byLifeboat.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-muted-foreground">Muster / lifeboat:</span>
            {pob.byLifeboat.map((l) => (
              <button
                key={l.name}
                onClick={() => toggle({ type: "lb", key: l.name })}
                className={cn(
                  "rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800 hover:bg-sky-200",
                  isOpen({ type: "lb", key: l.name }) && "ring-1 ring-sky-500",
                )}
              >
                {l.name} · {l.pob}
              </button>
            ))}
          </div>
        )}

        {/* Drill-down: crew member list (with assign + scheduling for the unassigned) */}
        {drill?.type === "crew" && drill.key === "Unassigned" && (
          <DrillCard
            title={`Unassigned on board — assign to a crew (${unassigned.length})`}
            onClose={() => setDrill(null)}
          >
            <BulkSchedule
              profileIds={unassigned.map((p) => p.profile_id).filter((x): x is string => Boolean(x))}
            />
            {unassigned.map((p) => (
              <UnassignedRow key={p.trip_id} person={p} crews={crews} />
            ))}
          </DrillCard>
        )}
        {drill?.type === "crew" && drill.key !== "Unassigned" && (() => {
          const onboard = pob.people.filter((p) => p.crew_name === drill.key);
          const onboardIds = new Set(onboard.map((p) => p.profile_id).filter(Boolean));
          const ashore = roster.filter((m) => m.crew_name === drill.key && !onboardIds.has(m.profile_id));
          return (
            <DrillCard
              title={`${drill.key} — ${onboard.length} on board · ${ashore.length} ashore`}
              onClose={() => setDrill(null)}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                On board ({onboard.length})
              </p>
              {onboard.map((p) => (
                <div key={p.trip_id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
                  <span className="font-medium">{p.name}</span>
                  {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
                  <span className="text-xs text-muted-foreground">
                    {p.mobilize_date} → {p.demob_date ?? "—"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {p.room_label ?? "—"}{p.bed_no ? ` · ${p.bed_no}` : ""}
                    {p.lifeboat ? ` · ${p.lifeboat}` : ""}
                  </span>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Demob ${p.name} now (before the crew change)?`))
                        run(() => offboardTrip(p.trip_id));
                    }}
                    className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-destructive/10 hover:text-destructive"
                  >
                    Demob
                  </button>
                </div>
              ))}
              {onboard.length === 0 && <p className="py-1 text-xs text-muted-foreground">Nobody on board.</p>}

              <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Not on board ({ashore.length})
              </p>
              {ashore.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
                  <span className="font-medium">{m.full_name || m.email}</span>
                  {m.company && <span className="text-xs text-muted-foreground">{m.company}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    ashore{m.lifeboat ? ` · ${m.lifeboat}` : ""}
                  </span>
                  <button
                    disabled={pending}
                    onClick={() => run(() => boardMember(m.profile_id))}
                    className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-green-50 hover:text-green-700"
                  >
                    Board now
                  </button>
                </div>
              ))}
              {ashore.length === 0 && <p className="py-1 text-xs text-muted-foreground">Whole crew is on board.</p>}
            </DrillCard>
          );
        })()}

        {/* Drill-down: muster station manifest */}
        {drill?.type === "lb" && (
          <DrillCard
            title={`Muster ${drill.key} — manifest (${pob.people.filter((p) => (p.lifeboat || "Unassigned") === drill.key).length})`}
            onClose={() => setDrill(null)}
          >
            {pob.people
              .filter((p) => (p.lifeboat || "Unassigned") === drill.key)
              .sort((a, b) => (a.room_label ?? "").localeCompare(b.room_label ?? "") || a.name.localeCompare(b.name))
              .map((p) => (
                <div key={p.trip_id} className="flex flex-wrap items-center gap-2 border-b py-1.5 text-sm last:border-0">
                  <span className="font-medium">{p.name}</span>
                  {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {p.room_label ?? "—"}{p.bed_no ? ` · ${p.bed_no}` : ""}
                    {p.crew_name ? ` · ${p.crew_name}` : ""}
                  </span>
                </div>
              ))}
          </DrillCard>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Accommodation
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rooms" value={accommodation.totalRooms} {...statDrill("rooms")} />
          <Stat label="Beds (usable)" value={accommodation.totalBeds} {...statDrill("beds")} />
          <Stat label="Occupied" value={accommodation.occupiedBeds} {...statDrill("occupied")} />
          <Stat label="Available" value={accommodation.availableBeds} tone="green" {...statDrill("available")} />
          <Stat label="Fixed (staff)" value={accommodation.fixedBeds} {...statDrill("fixed")} />
          <Stat label="Blocked rooms" value={accommodation.blockedRooms} {...statDrill("blocked")} />
        </div>
        {statDrillCard("acc")}
        {accommodation.overbooked.length > 0 && (
          <button
            onClick={() => toggle({ type: "rooms" })}
            className={cn(
              "mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100",
              isOpen({ type: "rooms" }) && "ring-1 ring-amber-500",
            )}
          >
            {accommodation.overbooked.length} room(s) hot-bunked — occupancy exceeds installed beds. View &amp; fix →
          </button>
        )}
        {drill?.type === "rooms" && (
          <DrillCard title="Hot-bunked rooms — reassign occupants to clear" onClose={() => setDrill(null)}>
            {accommodation.overbooked.map((r) => (
              <div key={r.room_id} className="border-b py-2 last:border-0">
                <p className="text-sm font-medium">
                  {r.label}{" "}
                  <span className="text-xs font-normal text-destructive">
                    {r.occupants.length} occupants / {r.beds} beds
                  </span>
                </p>
                <div className="mt-1 space-y-1">
                  {r.occupants.map((o) => (
                    <div key={o.trip_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span>{o.name}</span>
                      {o.bed_no && <span className="text-xs text-muted-foreground">{o.bed_no}</span>}
                      <LazySelect
                        value={r.room_id}
                        options={rooms}
                        getOptionValue={(rm) => rm.id}
                        getOptionLabel={(rm) => [rm.block, rm.room_number].filter(Boolean).join(" ")}
                        placeholder="— none —"
                        disabled={pending}
                        className={cn(field, "ml-auto py-1 text-xs")}
                        onChange={(v) => run(() => reassignTripRoom(o.trip_id, v))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </DrillCard>
        )}
      </section>

      {pob.overstayers.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-800">Overstayers (past planned return)</p>
          <ul className="mt-1 text-amber-800">
            {pob.overstayers.map((o, i) => (
              <li key={i}>
                {o.name} — {o.installation ?? "?"} · due {o.demob_date}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Certification alerts
        </h3>
        {certAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">All certifications valid for the next 30 days.</p>
        ) : (
          <div className="space-y-1">
            {certAlerts.map((a, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm",
                  a.expired ? "border-destructive/30 bg-destructive/5" : "bg-card",
                )}
              >
                <span>
                  {a.full_name} · <span className="uppercase">{a.kind}</span>
                </span>
                <span className={cn(a.expired ? "font-medium text-destructive" : "text-amber-700")}>
                  {a.expired ? "Expired" : "Expires"} {a.expiry}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function useRun() {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  };
  return { pending, error, run };
}

function InstallationsPanel({ installations }: { installations: Installation[] }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Platforms, rigs, FPSOs and vessels. POB capacity drives the over-capacity warnings on the
        dashboard.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Installation</th>
              <th className="px-4 py-2 font-medium">POB capacity</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {installations.map((i) => (
              <tr key={i.id} className={cn(i.is_active === false && "opacity-60")}>
                <td className="px-4 py-2">
                  <input
                    defaultValue={i.name}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== i.name) run(() => upsertInstallation({ id: i.id, name: v, pobCapacity: i.pob_capacity }));
                    }}
                    className={field}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    defaultValue={i.pob_capacity}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== i.pob_capacity) run(() => upsertInstallation({ id: i.id, name: i.name, pobCapacity: v }));
                    }}
                    className={`${field} w-24`}
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setInstallationActive(i.id, i.is_active === false))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      i.is_active === false
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {i.is_active === false ? "Retired" : "Active"}
                  </button>
                </td>
              </tr>
            ))}
            {installations.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No installations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => upsertInstallation({ name, pobCapacity: Number(capacity) || 0 }),
            () => {
              setName("");
              setCapacity("");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Installation (Platform A, FPSO…)" required className={field} />
        <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={0} placeholder="POB capacity" className={`${field} w-32`} />
        <Button type="submit" disabled={pending}>Add installation</Button>
      </form>
    </div>
  );
}

/** Editable crew name with an explicit Save button (preserves rotation/cycle). */
function CrewNameEditor({
  c,
  pending,
  run,
}: {
  c: Crew;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState(c.name);
  const changed = name.trim().length > 0 && name.trim() !== c.name;
  const save = () => {
    if (!changed) return;
    run(() =>
      upsertCrew({
        id: c.id,
        name: name.trim(),
        installationId: c.installation_id ?? undefined,
        rotationPattern: c.rotation_pattern ?? undefined,
        offshoreDays: c.offshore_days,
        onshoreDays: c.onshore_days,
        transportMode: c.transport_mode ?? undefined,
        departureLocation: c.departure_location ?? undefined,
        cycleStartDate: c.cycle_start_date ?? null,
      }),
    );
  };
  return (
    <div className="flex flex-1 items-center gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        disabled={pending}
        className={cn(field, "flex-1 font-medium")}
      />
      <Button size="sm" variant="outline" disabled={pending || !changed} onClick={save}>
        Save
      </Button>
    </div>
  );
}

function CrewsPanel({
  crews,
  installations,
  suggestions,
}: {
  crews: Crew[];
  installations: Installation[];
  suggestions: CrewChangeSuggestion[];
}) {
  // crew → which movement is due now (mobilise = outbound, demobilise = inbound)
  const dueByCrew = new Map(suggestions.map((s) => [s.crew_id, s.action]));
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [rotation, setRotation] = useState("14/14");
  const [transport, setTransport] = useState("");
  const [departure, setDeparture] = useState("");
  const [cycleStart, setCycleStart] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {crews.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <CrewNameEditor c={c} pending={pending} run={run} />
              <button
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete crew "${c.name}"? Members will be unassigned.`))
                    run(() => deleteCrew(c.id));
                }}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.installation_name ?? "No installation"} · {c.rotation_pattern || `${c.offshore_days}/${c.onshore_days}`}
              {c.transport_mode ? ` · ${c.transport_mode}` : ""}
              {c.departure_location ? ` · from ${c.departure_location}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{c.member_count} member(s)</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">
                Cycle start
                <input
                  type="date"
                  defaultValue={c.cycle_start_date ?? ""}
                  disabled={pending}
                  onBlur={(e) => {
                    if (e.target.value !== (c.cycle_start_date ?? ""))
                      run(() =>
                        upsertCrew({
                          id: c.id,
                          name: c.name,
                          offshoreDays: c.offshore_days,
                          onshoreDays: c.onshore_days,
                          cycleStartDate: e.target.value || null,
                        }),
                      );
                  }}
                  className={`mt-1 block ${field}`}
                />
              </label>
              {c.next_change_date && (
                <span className="text-xs text-muted-foreground">
                  Next change: <span className="font-medium text-foreground">{c.next_change_date}</span>
                </span>
              )}
            </div>
            {c.cycle_start_date && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => generateNextCrewChange(c.id, "out"))}
                  className={cn(
                    dueByCrew.get(c.id) === "mobilise" &&
                      "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  title={dueByCrew.get(c.id) === "mobilise" ? "Mobilisation due" : undefined}
                >
                  Inbound manifest (board)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => generateNextCrewChange(c.id, "in"))}
                  className={cn(
                    dueByCrew.get(c.id) === "demobilise" &&
                      "border-green-600 bg-green-600 text-white hover:bg-green-700",
                  )}
                  title={dueByCrew.get(c.id) === "demobilise" ? "Demobilisation due" : undefined}
                >
                  Outbound manifest (demob)
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="grid gap-2 rounded-lg border border-dashed bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const [off, on] = rotation.split("/").map((n) => parseInt(n, 10));
          run(
            () =>
              upsertCrew({
                name,
                installationId: installationId || undefined,
                rotationPattern: rotation,
                offshoreDays: off || 14,
                onshoreDays: on || off || 14,
                transportMode: transport,
                departureLocation: departure,
                cycleStartDate: cycleStart || null,
              }),
            () => {
              setName("");
              setTransport("");
              setDeparture("");
              setCycleStart("");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Crew name (Crew A)" required className={field} />
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className={field}>
          <option value="">Installation…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <input value={rotation} onChange={(e) => setRotation(e.target.value)} placeholder="Rotation (14/14)" className={field} />
        <input value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="Transport (helicopter)" className={field} />
        <input value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="Departure (Douala heliport)" className={field} />
        <label className="text-xs text-muted-foreground">
          Cycle start date
          <input value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} type="date" className={`mt-1 w-full ${field}`} />
        </label>
        <Button type="submit" disabled={pending}>Add crew</Button>
      </form>
    </div>
  );
}

const ROTATION_CELL: Record<RotationDay, string> = {
  offshore: "bg-primary",
  onshore: "bg-blue-500",
  change_out: "bg-amber-500",
  change_in: "bg-green-500",
};

/** Crew-name text colour by today's rotation status (mirrors ROTATION_CELL). */
const ROTATION_TEXT: Record<RotationDay, string> = {
  offshore: "text-primary",
  onshore: "text-blue-600",
  change_out: "text-amber-600",
  change_in: "text-green-600",
};

function RotationCalendarPanel({ calendar, crews }: { calendar: RotationCalendar; crews: Crew[] }) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const [repFrom, setRepFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [repWeeks, setRepWeeks] = useState(8);
  // Find today's column so each crew name can be coloured by where the crew is
  // right now (offshore vs onshore); fall back to the first plotted day.
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayIdx = calendar.days.indexOf(todayIso);
  const statusCol = todayIdx >= 0 ? todayIdx : 0;
  // Label every 7th day to keep the header readable.
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Weeks
          <input type="number" min={1} max={26} value={repWeeks} onChange={(e) => setRepWeeks(Number(e.target.value) || 8)} className={cn(field, "mt-0.5 block w-20 py-1")} />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!repFrom}
          onClick={() => window.open(`/offshore-rotation?from=${repFrom}&weeks=${repWeeks}`, "_blank")}
        >
          <FileText className="h-4 w-4" /> Open report (A3)
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" /> Offshore</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-500" /> Onshore</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500" /> Crew change (out)</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-green-500" /> Crew change (in)</span>
      </div>

      {calendar.crews.length === 0 && (
        <p className="text-sm text-muted-foreground">No active crews to plot.</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left">Crew</th>
              {calendar.days.map((d, i) => (
                <th key={d} className="px-0 py-1 text-center font-normal text-muted-foreground" style={{ minWidth: 10 }}>
                  {i % 7 === 0 ? <span className="block -rotate-0 text-[9px]">{fmt(d)}</span> : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.crews.map((c) => {
              const todayStatus = c.statuses[statusCol] ?? null;
              return (
              <tr key={c.id} className="border-t">
                <td className="sticky left-0 z-10 bg-card px-2 py-1 align-top">
                  <div
                    className={cn("font-medium", todayStatus ? ROTATION_TEXT[todayStatus] : "")}
                    title={todayStatus ? `Currently ${todayStatus.replace("_", " ")}` : "No rotation plotted"}
                  >
                    {c.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {c.offshore_days}/{c.onshore_days} · {c.member_count}
                  </div>
                </td>
                {c.statuses.map((s, i) => (
                  <td key={i} className="p-0">
                    <div
                      title={`${calendar.days[i]}${s ? ` · ${s.replace("_", " ")}` : ""}`}
                      className={cn("h-6 w-[10px]", s ? ROTATION_CELL[s] : "bg-transparent")}
                    />
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Bands are derived from each crew&apos;s rotation pattern and cycle start date. Set a cycle
        start on the Crew change tab to plot a crew. Each crew name is tinted by where the crew is
        today (offshore / onshore / crew change).
      </p>

      <CrewBackToBackList calendar={calendar} crews={crews} />
    </div>
  );
}

/** Crew-level back-to-back (the crew offshore while this one is ashore) + members. */
function CrewBackToBackList({ calendar, crews }: { calendar: RotationCalendar; crews: Crew[] }) {
  const EPOCH = new Date("2026-01-01T00:00:00Z").getTime();
  const DAY = 86_400_000;
  const phaseOf = (c: Crew) => {
    if (!c.cycle_start_date) return null;
    const cycle = c.offshore_days + c.onshore_days;
    if (cycle <= 0) return null;
    const d = Math.floor((new Date(c.cycle_start_date + "T00:00:00Z").getTime() - EPOCH) / DAY);
    return (((d % cycle) + cycle) % cycle);
  };
  const active = crews.filter((c) => c.is_active && c.cycle_start_date);
  // back-to-back = same pattern, phase offset by offshore_days (relieves this crew)
  const b2bOf = (c: Crew): Crew | null => {
    const cycle = c.offshore_days + c.onshore_days;
    const p = phaseOf(c);
    if (p === null) return null;
    const want = (p + c.offshore_days) % cycle;
    return (
      active.find(
        (o) =>
          o.id !== c.id &&
          o.offshore_days === c.offshore_days &&
          o.onshore_days === c.onshore_days &&
          phaseOf(o) === want,
      ) ?? null
    );
  };
  const membersByCrew = new Map(calendar.crews.map((c) => [c.id, c.members]));
  const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Crews · back-to-back &amp; members</h4>
      <div className="grid gap-2 lg:grid-cols-2">
        {sorted.map((c) => {
          const b2b = b2bOf(c);
          const members = membersByCrew.get(c.id) ?? [];
          return (
            <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.offshore_days}/{c.onshore_days} · {members.length} member(s)
                </span>
              </div>
              <p className="mt-0.5 text-xs">
                Back-to-back:{" "}
                <span className={cn("font-medium", b2b ? "text-foreground" : "text-muted-foreground")}>
                  {b2b ? b2b.name : "— none on opposite phase —"}
                </span>
              </p>
              {members.length > 0 && (
                <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {members.map((m, i) => (
                    <li key={i}>
                      <span className="mr-1 tabular-nums text-muted-foreground/70">{i + 1}.</span>
                      {m}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No crews with a cycle start to pair.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Live occupancy: every room with its checked-in occupants and a fill level.
 *
 * Editable in place (managers only — the Dispatcher is read-only on Rooms):
 * occupants come from the live trip (room + bed), cabin owners from the roster's
 * fixed cabin, so each half saves through its own action.
 */
function RoomOccupancyList({
  rooms,
  roster,
  employees,
  onboard,
  readOnly = false,
}: {
  rooms: Room[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  onboard: PobOnboard[];
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const { pending, error, run } = useRun();
  const occupiedRooms = rooms.filter((r) => r.occupied > 0).length;
  const totalOnboard = rooms.reduce((n, r) => n + r.occupied, 0);
  // Bed conflicts — two people on one bunk, a room over its berth count,
  // anyone on board here with no bed. The estate mixes positional labels,
  // the facility's own bunk numbers and bottom/top, all of which are valid,
  // so nothing is rewritten; the clashes are just made visible.
  const issuesByRoom = useMemo(() => {
    const m = new Map<string, ReturnType<typeof roomBedIssues>>();
    for (const r of rooms) {
      const found = roomBedIssues(r);
      if (found.length) m.set(r.id, found);
    }
    return m;
  }, [rooms]);
  const roomsWithIssues = issuesByRoom.size;

  // Roster row id per profile — owners carry a profile_id, but the roster action
  // keys off offshore_staff.id.
  const staffByProfile = useMemo(() => {
    const m = new Map<string, RosterEntry>();
    for (const s of roster) m.set(s.profile_id, s);
    return m;
  }, [roster]);

  const onboardProfileIds = useMemo(
    () => new Set(onboard.map((p) => p.profile_id).filter(Boolean) as string[]),
    [onboard],
  );

  // Roster members not on board. Allocating one of them a berth boards them in
  // the same step — see bedCandidates.
  const ashorePool = useMemo(() => {
    const aboard = new Set(onboard.map((p) => p.profile_id).filter(Boolean) as string[]);
    return offshorePeople(employees, rosterInfo(roster))
      .filter((m) => !aboard.has(m.profile_id))
      .map((m) => ({ profile_id: m.profile_id, name: m.name, crew_name: m.crew_name }));
  }, [employees, roster, onboard]);

  // Everyone on board, for the "put someone in this bed" picker.
  const pool = useMemo(
    () =>
      onboard.map((p) => ({
        id: p.trip_id,
        room_id: p.room_id,
        name: p.company ? `${p.name} · ${p.company}` : p.name,
        placedIn: p.room_id ? p.room_label : null,
        bed: p.bed_no,
      })),
    [onboard],
  );
  // Straight A→Z (numeric-aware, so Door 3 precedes Door 10) — a corridor order
  // you can scan, rather than one that reshuffles as people board.
  const allSorted = useMemo(() => sortRooms(rooms), [rooms]);
  // Picking a room narrows the grid to it, for editing one room without
  // hunting through the whole estate.
  const [pickedRoom, setPickedRoom] = useState<string | null>(null);
  const sorted = useMemo(
    () => (pickedRoom ? allSorted.filter((r) => r.id === pickedRoom) : allSorted),
    [allSorted, pickedRoom],
  );

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <span className="text-sm font-semibold">
          Room occupancy (live) — {occupiedRooms} room(s) in use · {totalOnboard} on board
          {roomsWithIssues > 0 && (
            <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              {roomsWithIssues} room(s) need attention
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {error && (
            <p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          {!readOnly && (
            <p className="mb-2 text-xs text-muted-foreground">
              Edit in place: change a bed label, remove someone from a bed, or seat a waiting person.
              Allocating a berth to someone who is ashore also boards them, so they appear on POB and
              the muster roll. Cabin owner(s) set the roster&apos;s fixed cabin — the permanent
              allocation auto-allocate honours first.
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Go to room
              <SearchSelect
                value={pickedRoom}
                options={allSorted}
                getOptionValue={(r) => r.id}
                getOptionLabel={(r) =>
                  `${roomLabel(r)}${r.installation_name ? ` · ${r.installation_name}` : ""} — ${r.occupied}/${r.bed_count || 0}`
                }
                placeholder="All rooms — type to find one…"
                wrapperClassName="mt-0.5 w-64"
                className={cn(field, "w-full py-1")}
                onChange={setPickedRoom}
              />
            </label>
            {pickedRoom && (
              <Button size="sm" variant="outline" onClick={() => setPickedRoom(null)}>
                Show all {allSorted.length} rooms
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((r) => {
              const label = roomLabel(r);
              const beds = r.bed_count || 0;
              const over = r.occupied > beds;
              const pct = beds > 0 ? Math.min(100, (r.occupied / beds) * 100) : r.occupied > 0 ? 100 : 0;
              // A blocked / under-maintenance room keeps its occupants (and the
              // controls to move them out) but takes nobody new.
              const takesPeople = !["blocked", "maintenance"].includes(r.status);
              const free = takesPeople ? Math.max(0, beds - r.occupants.length) : 0;
              // Suggested labels for the empty beds: lowest "Bed N" not in use.
              const usedBeds = new Set(r.occupants.map((o) => o.bed_no).filter(Boolean) as string[]);
              const slotLabels: string[] = [];
              let k = 0;
              while (slotLabels.length < free) {
                k++;
                const lbl = `Bed ${k}`;
                if (!usedBeds.has(lbl)) slotLabels.push(lbl);
              }
              const candidates = bedCandidates(pool, r.id, ashorePool, !readOnly);
              const ownerIds = new Set(r.owners.map((o) => o.profile_id));
              const roomIssues = issuesByRoom.get(r.id) ?? [];
              // A bed belongs to a live trip, so an owner who is ashore has
              // nothing to attach one to — they are not in the picker, and
              // without saying so their absence reads as a bug.
              const ashoreOwners = r.owners.filter((o) => !onboardProfileIds.has(o.profile_id));
              const dupBeds = duplicateBedKeys(r);
              const ownerCandidates = roster
                .filter((s) => !ownerIds.has(s.profile_id))
                .map((s) => ({
                  id: s.id,
                  label: s.fixed_room_id
                    ? `${s.full_name || s.email} — move from ${s.fixed_room_label ?? "a cabin"}`
                    : s.full_name || s.email,
                }));
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-md border p-2 text-sm",
                    // Empty rooms recede only when there's nothing to do with
                    // them — with the editors on they are a place to seat people.
                    readOnly && r.occupied === 0 && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{label}</span>
                    <span className={cn("text-xs font-semibold", over ? "text-destructive" : r.occupied === 0 ? "text-muted-foreground" : "text-green-700")}>
                      {r.occupied}/{beds}
                      {over ? " · hot-bunk" : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full", over ? "bg-destructive" : "bg-green-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {roomIssues.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 rounded border border-destructive/30 bg-destructive/5 px-1.5 py-1">
                      {roomIssues.map((iss, n) => (
                        <li key={n} className="flex items-start gap-1 text-[11px] text-destructive">
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                          {iss.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(r.occupants.length > 0 || (!readOnly && slotLabels.length > 0)) && (
                    <ul className="mt-1.5 space-y-1">
                      {r.occupants.map((o) =>
                        readOnly || o.kind === "visitor" ? (
                          <li key={o.trip_id} className="flex items-center gap-1.5 text-xs">
                            <span
                              className={cn(
                                "font-mono",
                                o.bed_no && dupBeds.has(bedKey(o.bed_no))
                                  ? "font-semibold text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {o.bed_no || "•"}
                            </span>
                            <span className="font-medium">{o.name}</span>
                            {o.kind === "visitor" && (
                              <span
                                className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                                title="Holds this bed through a visit booking — change it on the Visitors tab"
                              >
                                visitor
                              </span>
                            )}
                          </li>
                        ) : (
                          <OccupantRow
                            key={o.trip_id}
                            occupant={o}
                            roomId={r.id}
                            clashes={Boolean(o.bed_no) && dupBeds.has(bedKey(o.bed_no ?? ""))}
                            pending={pending}
                            run={run}
                          />
                        ),
                      )}
                      {!readOnly &&
                        slotLabels.map((lbl) => (
                          <EmptyBed
                            key={`${r.id}-${lbl}`}
                            roomId={r.id}
                            defaultBed={lbl}
                            candidates={candidates}
                            pending={pending}
                            run={run}
                          />
                        ))}
                    </ul>
                  )}
                  {!readOnly && ashoreOwners.length > 0 && (
                    <p className="mt-1.5 rounded border border-dashed bg-muted/30 px-1.5 py-1 text-[11px] text-muted-foreground">
                      {ashoreOwners.length} cabin owner(s) are ashore. Picking one in a bed above
                      boards them into it — they join POB and the muster roll straight away. Their
                      permanent berth is editable below without boarding them.
                    </p>
                  )}
                  {(r.owners.length > 0 || !readOnly) && (
                    <div className="mt-1.5 border-t pt-1 text-[11px] text-muted-foreground">
                      <span className="font-medium">Cabin owner(s)</span>
                      <ul className="mt-0.5 space-y-0.5">
                        {r.owners.map((o) =>
                          readOnly ? (
                            <li key={o.profile_id} className="flex items-center gap-1">
                              <span className="font-mono">{o.bed || "•"}</span>
                              <span>{o.name}</span>
                              {!onboardProfileIds.has(o.profile_id) && (
                                <span className="text-muted-foreground/70">· ashore</span>
                              )}
                              {o.back_to_back ? <span className="text-muted-foreground/70"> ⇄ {o.back_to_back}</span> : ""}
                            </li>
                          ) : (
                            <OwnerRow
                              key={o.profile_id}
                              owner={o}
                              staffId={staffByProfile.get(o.profile_id)?.id ?? null}
                              aboard={onboardProfileIds.has(o.profile_id)}
                              pending={pending}
                              run={run}
                            />
                          ),
                        )}
                      </ul>
                      {!readOnly && (
                        <SearchSelect
                          value={null}
                          options={ownerCandidates}
                          getOptionValue={(s) => s.id}
                          getOptionLabel={(s) => s.label}
                          placeholder={ownerCandidates.length ? "Type a name to add owner…" : "— no one left —"}
                          disabled={pending || ownerCandidates.length === 0}
                          wrapperClassName="mt-1"
                          className="w-full rounded border bg-background px-1 py-0.5 text-[11px]"
                          onChange={(v) => v && run(() => updateRosterMember({ id: v, fixedRoomId: r.id }))}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {rooms.length === 0 && <p className="text-sm text-muted-foreground">No rooms yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bed board — every usable room with at least one empty bed, with inline
 * assignment of an on-board person (one who has no bed yet) straight into a
 * free bed. Assigning sets that trip's room + bed, so the person leaves the
 * "waiting for a bed" pool on the next refresh.
 */
function BedBoardPanel({
  rooms,
  onboard,
  roster,
  employees,
  readOnly = false,
}: {
  rooms: Room[];
  onboard: PobOnboard[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  readOnly?: boolean;
}) {
  const { pending, error, run } = useRun();
  const [q, setQ] = useState("");
  // Full rooms stay on the board by default — they still need editing (move
  // someone out, relabel a bed). Tick the filter to narrow to rooms with space.
  const [freeOnly, setFreeOnly] = useState(false);
  const [allocMsg, setAllocMsg] = useState<string | null>(null);

  function autoAllocate() {
    setAllocMsg(null);
    run(async () => {
      const res = await autoAllocateBeds();
      if (res.ok) {
        const placed = res.placed ?? 0;
        const unplaced = res.unplaced ?? 0;
        setAllocMsg(
          placed === 0 && unplaced === 0
            ? "Everyone on board already has a bed."
            : `Seated ${placed} ${placed === 1 ? "person" : "people"}` +
                (unplaced ? ` · ${unplaced} still need a manual bed (no free room open to anyone)` : "") +
                ".",
        );
      }
      return res;
    });
  }

  const labelOf = (r: Room) => [r.block, r.room_number].filter(Boolean).join(" ");

  // Everyone on board is a candidate: those with no bed (assign) and those in
  // another room (move). A person holds a single on-board trip, so pointing that
  // trip at a new room+bed is inherently "one room at a time" — the move clears
  // their previous room automatically.
  const pool = useMemo(
    () =>
      onboard.map((p) => ({
        id: p.trip_id,
        room_id: p.room_id,
        name: p.company ? `${p.name} · ${p.company}` : p.name,
        placedIn: p.room_id ? p.room_label : null,
        bed: p.bed_no,
      })),
    [onboard],
  );
  const waitingCount = pool.filter((p) => !p.room_id).length;

  // Roster members not on board; allocating a berth boards them (bedCandidates).
  const ashorePool = useMemo(() => {
    const aboard = new Set(onboard.map((p) => p.profile_id).filter(Boolean) as string[]);
    return offshorePeople(employees, rosterInfo(roster))
      .filter((m) => !aboard.has(m.profile_id))
      .map((m) => ({ profile_id: m.profile_id, name: m.name, crew_name: m.crew_name }));
  }, [employees, roster, onboard]);

  const usable = useMemo(
    () => rooms.filter((r) => !["blocked", "maintenance"].includes(r.status)),
    [rooms],
  );
  const totalFree = usable.reduce((n, r) => n + Math.max(0, (r.bed_count || 0) - r.occupied), 0);

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    return usable
      .filter((r) => {
        const free = (r.bed_count || 0) - r.occupied;
        if (freeOnly && free <= 0) return false;
        if (!needle) return true;
        const hay = [r.block, r.floor, r.room_number, r.lifeboat].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        // Rooms with a free bed first, then by label.
        const fa = (a.bed_count || 0) - a.occupied;
        const fb = (b.bed_count || 0) - b.occupied;
        return (fb > 0 ? 1 : 0) - (fa > 0 ? 1 : 0) || labelOf(a).localeCompare(labelOf(b));
      });
  }, [usable, needle, freeOnly]);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Every usable room, full ones included so you can always move someone out. Type a name into an
        empty bed to drop that person straight into it — their POB record gets that room &amp; bed.
        Anyone ashore is offered too — not just rostered crew — and picking one boards them into that
        bed. Blocked and under-maintenance rooms are hidden.
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
        <span className="font-semibold text-green-700">{totalFree}</span>
        <span className="text-muted-foreground">free bed(s)</span>
        <span className="text-muted-foreground">·</span>
        <span className={cn("font-semibold", waitingCount ? "text-amber-600" : "text-muted-foreground")}>
          {waitingCount}
        </span>
        <span className="text-muted-foreground">on board waiting for a bed</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!readOnly && (
            <Button size="sm" disabled={pending || waitingCount === 0} onClick={autoAllocate}>
              Auto-allocate beds
            </Button>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter rooms…"
            className={cn(field, "py-1")}
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
            Only rooms with a free bed
          </label>
        </div>
      </div>

      {allocMsg && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          {allocMsg}
        </p>
      )}
      {!readOnly && waitingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Auto-allocate beds</span> seats everyone waiting — honouring
          fixed cabins first, then filling rooms open to anyone. Gender-restricted rooms are left for
          you to place by hand below.
        </p>
      )}

      {pool.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Nobody is on board yet — empty beds can be filled once people board.
        </p>
      ) : (
        waitingCount === 0 && (
          <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Everyone on board already has a bed. You can still pick someone to move them into a
            different room — they only ever occupy one room at a time.
          </p>
        )
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const beds = r.bed_count || 0;
          const free = Math.max(0, beds - r.occupants.length);
          const over = r.occupied > beds;
          const used = new Set(r.occupants.map((o) => o.bed_no).filter(Boolean) as string[]);
          // Suggested labels for the empty beds: the lowest "Bed N" not already taken.
          const slotLabels: string[] = [];
          let k = 0;
          while (slotLabels.length < free) {
            k++;
            const lbl = `Bed ${k}`;
            if (!used.has(lbl)) slotLabels.push(lbl);
          }
          // Candidates for this room's empty beds: everyone on board except the
          // people already in it. Waiting (bed-less) people sort to the top;
          // placed people read as "move from <their room>".
          const candidates = bedCandidates(pool, r.id, ashorePool, !readOnly);
          return (
            <div key={r.id} className="rounded-md border bg-card p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{labelOf(r) || "—"}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    over ? "text-destructive" : free > 0 ? "text-green-700" : "text-muted-foreground",
                  )}
                >
                  {r.occupied}/{beds}
                  {over ? " · hot-bunk" : free > 0 ? ` · ${free} free` : " · full"}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                <span className="rounded bg-muted px-1 py-0.5">{r.room_type}</span>
                {r.gender_restriction !== "any" && (
                  <span className="rounded bg-muted px-1 py-0.5">{GENDER_LABEL[r.gender_restriction]}</span>
                )}
                {r.status !== "available" && (
                  <span className="rounded bg-muted px-1 py-0.5">{ROOM_STATUS_LABEL[r.status]}</span>
                )}
                {r.lifeboat && <span className="rounded bg-muted px-1 py-0.5">LB {r.lifeboat}</span>}
              </div>

              <ul className="mt-1.5 space-y-1">
                {r.occupants.map((o) => (
                  <li
                    key={o.trip_id}
                    className="flex items-center gap-1.5 rounded bg-muted/40 px-2 py-1 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">{o.bed_no || "•"}</span>
                    <span className="truncate font-medium">{o.name}</span>
                    {o.kind === "visitor" && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        visitor
                      </span>
                    )}
                    {!readOnly && o.kind !== "visitor" && (
                      <button
                        disabled={pending}
                        title={`Unassign ${o.name} from this bed (stays on board, returns to the waiting list)`}
                        onClick={() => run(() => reassignTripRoom(o.trip_id, null))}
                        className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
                {!readOnly &&
                  slotLabels.map((lbl) => (
                    <EmptyBed
                      key={`${r.id}-${lbl}`}
                      roomId={r.id}
                      defaultBed={lbl}
                      candidates={candidates}
                      pending={pending}
                      run={run}
                    />
                  ))}
              </ul>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {usable.length === 0
              ? "No rooms yet."
              : freeOnly
                ? "Every room is full. Untick “Only rooms with a free bed” to see them all."
                : "No room matches that filter."}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One live occupant on the occupancy card: rename their bed (saved on blur) or
 * lift them out of it. Unassigning keeps them on board — they drop back into the
 * "waiting for a bed" pool.
 */
function OccupantRow({
  occupant,
  roomId,
  clashes = false,
  pending,
  run,
}: {
  occupant: Room["occupants"][number];
  roomId: string;
  /** True when somebody else in this room holds the same bed. */
  clashes?: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const original = occupant.bed_no ?? "";
  const [bed, setBed] = useState(original);
  // Re-sync when the server sends a different value (e.g. after auto-allocate).
  useEffect(() => setBed(original), [original]);
  return (
    <li className="flex items-center gap-1.5 rounded bg-muted/40 px-1.5 py-1 text-xs">
      <input
        value={bed}
        disabled={pending}
        aria-label={`Bed for ${occupant.name}`}
        placeholder="•"
        onChange={(e) => setBed(e.target.value)}
        onBlur={() => {
          if (bed.trim() !== original) run(() => reassignTripRoom(occupant.trip_id, roomId, bed));
        }}
        title={clashes ? "Someone else in this room holds this bed" : undefined}
        className={cn(
          "w-14 shrink-0 rounded border bg-background px-1 py-0.5 font-mono text-[11px]",
          clashes && "border-destructive font-semibold text-destructive",
        )}
      />
      <span className="truncate font-medium">{occupant.name}</span>
      <button
        disabled={pending}
        title={`Unassign ${occupant.name} from this bed (stays on board, returns to the waiting list)`}
        onClick={() => run(() => reassignTripRoom(occupant.trip_id, null))}
        className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/**
 * One cabin owner on the occupancy card — the roster's fixed cabin, not a live
 * trip. Editing the bed or clearing the owner writes straight to the roster row,
 * exactly as the Roster tab's fixed-room fields do.
 */
function OwnerRow({
  owner,
  staffId,
  aboard = false,
  pending,
  run,
}: {
  owner: Room["owners"][number];
  staffId: string | null;
  /** False when they are on their off-rotation, so they can hold no bed. */
  aboard?: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const original = owner.bed ?? "";
  const [bed, setBed] = useState(original);
  useEffect(() => setBed(original), [original]);
  // Owners always resolve to a roster row; guard anyway so a stale render can't
  // fire an update with no id.
  const editable = Boolean(staffId) && !pending;
  return (
    <li className="flex items-center gap-1">
      <input
        value={bed}
        disabled={!editable}
        aria-label={`Fixed bed for ${owner.name}`}
        placeholder="•"
        onChange={(e) => setBed(e.target.value)}
        onBlur={() => {
          if (staffId && bed.trim() !== original) run(() => updateRosterMember({ id: staffId, fixedBed: bed }));
        }}
        className="w-14 shrink-0 rounded border bg-background px-1 py-0.5 font-mono text-[11px]"
      />
      <span className="truncate">{owner.name}</span>
      {!aboard && (
        <span
          className="shrink-0 text-muted-foreground/70"
          title="Ashore on their off-rotation — board them before they can take a bed"
        >
          · ashore
        </span>
      )}
      {owner.back_to_back ? <span className="shrink-0 text-muted-foreground/70">⇄ {owner.back_to_back}</span> : null}
      <button
        disabled={!editable}
        title={`Remove ${owner.name} as an owner of this cabin (clears their fixed cabin)`}
        onClick={() => staffId && run(() => updateRosterMember({ id: staffId, fixedRoomId: null }))}
        className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/**
 * One empty bed slot: an editable bed label + a picker that places the chosen
 * on-board person into this bed on select. Picking someone already in another
 * room moves them here (a single trip, so one room at a time).
 */
function EmptyBed({
  roomId,
  defaultBed,
  candidates,
  pending,
  run,
}: {
  roomId: string;
  defaultBed: string;
  candidates: BedCandidate[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [bed, setBed] = useState(defaultBed);
  return (
    <li className="flex items-center gap-1.5 rounded border border-dashed bg-background px-2 py-1 text-xs">
      <input
        value={bed}
        onChange={(e) => setBed(e.target.value)}
        aria-label="Bed label"
        className="w-16 shrink-0 rounded border bg-background px-1 py-0.5 font-mono text-[11px]"
      />
      <SearchSelect
        value={null}
        options={candidates}
        getOptionValue={(p) => p.id}
        getOptionLabel={(p) => p.label}
        placeholder={candidates.length ? "Type a name to assign / move…" : "— nobody available —"}
        disabled={pending || candidates.length === 0}
        wrapperClassName="flex-1"
        className="w-full rounded border bg-background px-1 py-0.5 text-[11px]"
        onChange={(v) => {
          const pick = candidates.find((c) => c.id === v);
          if (!pick) return;
          // "board" carries a profile id and puts an ashore person on board in
          // the same step; "move" carries a trip id and only reseats them.
          if (pick.kind === "board") {
            run(() => boardMember(pick.id, { roomId, bedNo: bed.trim() || null }));
          } else {
            run(() => reassignTripRoom(pick.id, roomId, bed.trim() || null));
          }
        }}
      />
    </li>
  );
}

function RoomsPanel({
  rooms,
  installations,
  roster,
  employees,
  onboard,
  readOnly = false,
}: {
  rooms: Room[];
  installations: Installation[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  onboard: PobOnboard[];
  readOnly?: boolean;
}) {
  const { pending, error, run } = useRun();
  const [installationId, setInstallationId] = useState("");
  const [block, setBlock] = useState("");
  const [floor, setFloor] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [beds, setBeds] = useState("2");
  const [gender, setGender] = useState<GenderRestriction>("any");
  const [repDate, setRepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const roomsReveal = useProgressiveReveal(rooms.length);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          As of
          <input type="date" value={repDate} onChange={(e) => setRepDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <Button size="sm" variant="outline" disabled={!repDate} onClick={() => window.open(`/offshore-rooms?date=${repDate}`, "_blank")}>
          <FileText className="h-4 w-4" /> Room allocation report
        </Button>
      </div>
      <RoomOccupancyList
        rooms={rooms}
        roster={roster}
        employees={employees}
        onboard={onboard}
        readOnly={readOnly}
      />
      {!readOnly && (
        <>
      <BulkRoomImport />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Room</th>
              <th className="px-3 py-2 font-medium">Installation</th>
              <th className="px-3 py-2 font-medium">Floor</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Beds</th>
              <th className="px-3 py-2 font-medium">Muster</th>
              <th className="px-3 py-2 font-medium">Gender</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rooms.slice(0, roomsReveal.count).map((r) => {
              const cell = "w-full rounded-md border bg-background px-2 py-1 text-xs";
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={r.block ?? ""}
                        disabled={pending}
                        placeholder="Block"
                        onBlur={(e) => {
                          if (e.target.value !== (r.block ?? "")) run(() => updateRoomFields({ id: r.id, block: e.target.value }));
                        }}
                        className={`${cell} w-16`}
                      />
                      <input
                        defaultValue={r.room_number}
                        disabled={pending}
                        onBlur={(e) => {
                          if (e.target.value !== r.room_number) run(() => updateRoomFields({ id: r.id, roomNumber: e.target.value }));
                        }}
                        className={`${cell} w-24 font-medium`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.installation_name}</td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.floor ?? ""}
                      disabled={pending}
                      placeholder="—"
                      onBlur={(e) => {
                        if (e.target.value !== (r.floor ?? "")) run(() => updateRoomFields({ id: r.id, floor: e.target.value }));
                      }}
                      className={cell}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.room_type}
                      disabled={pending}
                      onChange={(e) => run(() => updateRoomFields({ id: r.id, roomType: e.target.value }))}
                      className={`${cell} capitalize`}
                    >
                      {["single", "double", "shared", "vip", "medic"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        defaultValue={r.bed_count}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== r.bed_count) run(() => updateRoomFields({ id: r.id, bedCount: v }));
                        }}
                        className={`${cell} w-16`}
                      />
                      {r.fixed_assigned > 0 && (
                        <span className="text-[10px] text-muted-foreground">{r.fixed_assigned} fixed</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.lifeboat ?? ""}
                      disabled={pending}
                      placeholder="LB-1"
                      onBlur={(e) => {
                        if (e.target.value !== (r.lifeboat ?? "")) run(() => updateRoomFields({ id: r.id, lifeboat: e.target.value }));
                      }}
                      className={`${cell} w-20`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.gender_restriction}
                      disabled={pending}
                      onChange={(e) => run(() => updateRoomFields({ id: r.id, genderRestriction: e.target.value }))}
                      className={cell}
                    >
                      {(Object.keys(GENDER_LABEL) as GenderRestriction[]).map((g) => (
                        <option key={g} value={g}>{GENDER_LABEL[g]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      disabled={pending}
                      onChange={(e) => run(() => setRoomStatus(r.id, e.target.value))}
                      className={cell}
                    >
                      {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                        <option key={s} value={s}>{ROOM_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {rooms.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No rooms yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMore
        ref={roomsReveal.sentinelRef}
        hasMore={roomsReveal.hasMore}
        remaining={roomsReveal.remaining}
        onClick={roomsReveal.showMore}
        label="Show more rooms"
      />

      <form
        className="grid gap-2 rounded-lg border border-dashed bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              upsertRoom({
                installationId,
                block,
                floor,
                roomNumber,
                roomType,
                bedCount: Number(beds),
                maxBedCount: Number(beds),
                genderRestriction: gender,
              }),
            () => {
              setRoomNumber("");
              setBlock("");
              setFloor("");
            },
          );
        }}
      >
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} required className={field}>
          <option value="">Installation…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Block (optional)" className={field} />
        <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Floor / location" className={field} />
        <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Room no. (A-203)" required className={field} />
        <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className={`${field} capitalize`}>
          {["single", "double", "shared", "vip", "medic"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input value={beds} onChange={(e) => setBeds(e.target.value)} type="number" min={0} placeholder="Beds" className={field} />
        <select value={gender} onChange={(e) => setGender(e.target.value as GenderRestriction)} className={field}>
          {(Object.keys(GENDER_LABEL) as GenderRestriction[]).map((g) => (
            <option key={g} value={g}>{GENDER_LABEL[g]}</option>
          ))}
        </select>
        <Button type="submit" disabled={pending}>Add room</Button>
      </form>
        </>
      )}
    </div>
  );
}

function RosterPanel({
  roster,
  crews,
  rooms,
  addable,
}: {
  roster: RosterEntry[];
  crews: Crew[];
  rooms: Room[];
  addable: { id: string; full_name: string }[];
}) {
  const { pending, error, run } = useRun();
  const [newId, setNewId] = useState("");
  const [repDate, setRepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const rosterReveal = useProgressiveReveal(roster.length);

  function expired(date: string | null) {
    return date ? new Date(date) < new Date() : false;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          As of
          <input type="date" value={repDate} onChange={(e) => setRepDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <Button size="sm" variant="outline" disabled={!repDate} onClick={() => window.open(`/offshore-roster?date=${repDate}`, "_blank")}>
          <FileText className="h-4 w-4" /> Roster &amp; room allocation report
        </Button>
      </div>

      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-card/50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addRosterMember(newId), () => setNewId(""));
        }}
      >
        <span className="text-sm font-medium">Add to roster:</span>
        <LazySelect
          value={newId || null}
          options={addable}
          getOptionValue={(p) => p.id}
          getOptionLabel={(p) => p.full_name}
          placeholder="Choose person…"
          className={field}
          onChange={(v) => setNewId(v ?? "")}
        />
        <Button type="submit" size="sm" disabled={pending || !newId}>Add</Button>
      </form>

      <BulkRosterImport />

      <div className="space-y-3">
        {roster.slice(0, rosterReveal.count).map((m) => (
          <div key={m.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.full_name || m.email}</span>
              {!m.travel_eligible && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                  Not eligible
                </span>
              )}
              {!m.is_rotational && (
                <span
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  title="Works offshore but sits outside the crew rotation — no crew, skipped by the rotation calendar."
                >
                  Non-rotational
                </span>
              )}
              {m.crew_name && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {m.crew_name}
                </span>
              )}
              {m.company && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {m.company}
                </span>
              )}
              {m.fixed_room_label && (
                <span className="text-xs text-muted-foreground">
                  Room {m.fixed_room_label}
                  {m.fixed_bed ? ` · ${m.fixed_bed}` : ""}
                </span>
              )}
              {m.lifeboat && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  {m.lifeboat}
                </span>
              )}
              {m.back_to_back_name && (
                <span className="text-xs text-muted-foreground">B2B: {m.back_to_back_name}</span>
              )}
              <button
                disabled={pending}
                onClick={() => run(() => removeRosterMember(m.id))}
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={m.crew_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateRosterMember({ id: m.id, crewId: e.target.value || null }))}
                className={field}
              >
                <option value="">Crew…</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                defaultValue={m.position ?? ""}
                disabled={pending}
                placeholder="Position"
                onBlur={(e) => {
                  if (e.target.value !== (m.position ?? "")) run(() => updateRosterMember({ id: m.id, position: e.target.value }));
                }}
                className={field}
              />
              <input
                defaultValue={m.company ?? ""}
                disabled={pending}
                placeholder="Company (APCC, TEFON…)"
                onBlur={(e) => {
                  if (e.target.value !== (m.company ?? "")) run(() => updateRosterMember({ id: m.id, company: e.target.value }));
                }}
                className={field}
              />
              <LazySelect
                value={m.back_to_back_id ?? null}
                options={roster.filter((o) => o.profile_id !== m.profile_id)}
                getOptionValue={(o) => o.profile_id}
                getOptionLabel={(o) => o.full_name || o.email || ""}
                placeholder="Back-to-back…"
                disabled={pending}
                className={field}
                onChange={(v) => run(() => updateRosterMember({ id: m.id, backToBackId: v }))}
              />
              <LazySelect
                value={m.fixed_room_id ?? null}
                options={rooms}
                getOptionValue={(r) => r.id}
                getOptionLabel={(r) => [r.block, r.room_number].filter(Boolean).join(" ")}
                placeholder="Fixed room…"
                disabled={pending}
                className={field}
                onChange={(v) => run(() => updateRosterMember({ id: m.id, fixedRoomId: v }))}
              />
              <input
                defaultValue={m.fixed_bed ?? ""}
                disabled={pending}
                placeholder="Fixed bed (Bed 1)"
                onBlur={(e) => {
                  if (e.target.value !== (m.fixed_bed ?? "")) run(() => updateRosterMember({ id: m.id, fixedBed: e.target.value }));
                }}
                className={field}
              />
              <div className={cn(field, "flex items-center gap-1 bg-muted/40")} title="Muster follows the fixed room">
                <span className="text-xs text-muted-foreground">Muster:</span>
                <span className="font-medium">{m.lifeboat ?? "— set on room —"}</span>
              </div>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <CertInput label="Medical" value={m.medical_expiry} expired={expired(m.medical_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, medicalExpiry: v }))} />
              <CertInput label="BOSIET" value={m.bosiet_expiry} expired={expired(m.bosiet_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, bosietExpiry: v }))} />
              <CertInput label="HUET" value={m.huet_expiry} expired={expired(m.huet_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, huetExpiry: v }))} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.travel_eligible}
                  disabled={pending}
                  onChange={(e) => run(() => updateRosterMember({ id: m.id, travelEligible: e.target.checked }))}
                />
                Travel eligible
              </label>
            </div>
          </div>
        ))}
        {roster.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No offshore staff on the roster yet.
          </p>
        )}
      </div>
      <ShowMore
        ref={rosterReveal.sentinelRef}
        hasMore={rosterReveal.hasMore}
        remaining={rosterReveal.remaining}
        onClick={rosterReveal.showMore}
        label="Show more roster members"
      />
    </div>
  );
}

function CertInput({
  label,
  value,
  expired,
  onSave,
}: {
  label: string;
  value: string | null;
  expired: boolean;
  onSave: (v: string) => void;
}) {
  return (
    <label className={cn("text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
      {label} expiry{expired ? " (expired)" : ""}
      <input
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          if (e.target.value !== (value ?? "")) onSave(e.target.value);
        }}
        className={cn(field, "mt-1 w-full", expired && "border-destructive")}
      />
    </label>
  );
}
