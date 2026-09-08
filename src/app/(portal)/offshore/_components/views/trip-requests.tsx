"use client";

import { useState } from "react";
import { Archive, BedDouble, CheckCircle2, Inbox, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  canApproveRequests,
  canAssignRooms,
  groupByParty,
  requestCounts,
  requestQueues,
} from "@/lib/offshore/trip-requests";
import { pastRequests } from "@/lib/offshore/past-requests";
import {
  OFFSHORE_STATUS_LABEL,
  VISIT_STATUS_LABEL,
  VISITOR_TYPE_LABEL,
  type OffshoreTrip,
  type Room,
  type RoomAvailability,
  type VisitRequest,
} from "@/types/offshore";
import {
  allocateVisitorBed,
  archivePastRequests,
  clearHse,
  decideVisitGroup,
  decideVisitRequest,
  findAvailableBeds,
  findStaffBeds,
  placeTripInRoom,
  setOffshoreStatus,
} from "../../actions";
import type { OffshoreRoleFlags } from "../offshore-views";
import { useRun } from "./shared";

/**
 * Trip Requests: every request to go offshore, and the two decisions each
 * one waits for.
 *
 * The OIM decides whether a trip happens (a visit request is approved, a
 * staff trip is HSE-cleared). The Campboss finds the bed. Admins do both;
 * an Operations Supervisor follows the queue without deciding it. The panel
 * shows only the controls the viewer's role may use, so nobody is offered a
 * button the server would refuse.
 */
export function TripRequestsPanel({
  visits,
  trips,
  rooms,
  flags,
}: {
  visits: VisitRequest[];
  trips: OffshoreTrip[];
  rooms: Room[];
  flags: OffshoreRoleFlags;
}) {
  const { pending, error, run } = useRun();
  const q = requestQueues(visits, trips);
  const counts = requestCounts(q);
  const approve = canApproveRequests(flags);
  const bed = canAssignRooms(flags);
  const past = pastRequests(visits, trips, new Date().toISOString().slice(0, 10));
  const pastCount = past.trips.length + past.visits.length;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {pastCount > 0 && <ArchivePast count={pastCount} approve={approve} pending={pending} run={run} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Awaiting the OIM"
          value={counts.toApprove}
          sub={approve ? "Approve or reject below" : "Visit requests and HSE clearance"}
          tone={counts.toApprove ? "amber" : undefined}
        />
        <Tile
          icon={<BedDouble className="h-4 w-4" />}
          label="Awaiting a room"
          value={counts.toBed}
          sub={bed ? "Approved; assign a room below" : "Approved, waiting on the Campboss"}
          tone={counts.toBed ? "amber" : undefined}
        />
        <Tile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Ready to travel"
          value={counts.ready}
          sub="Approved and bedded"
          tone={counts.ready ? "green" : undefined}
        />
      </div>

      <Section title="Awaiting the OIM's decision" count={counts.toApprove} empty="Nothing waiting for a decision.">
        {groupByParty(q.visitsToApprove).map((party) => (
          <VisitParty key={party[0].group_id ?? party[0].id} party={party} approve={approve} bed={false} pending={pending} run={run} />
        ))}
        {q.tripsToApprove.map((t) => (
          <TripRow key={t.id} t={t} approve={approve} bed={false} rooms={rooms} pending={pending} run={run} />
        ))}
      </Section>

      <Section title="Approved, awaiting a room" count={counts.toBed} empty="Everyone approved has a bed.">
        {groupByParty(q.visitsToBed).map((party) => (
          <VisitParty key={party[0].group_id ?? party[0].id} party={party} approve={false} bed={bed} pending={pending} run={run} />
        ))}
        {q.tripsToBed.map((t) => (
          <TripRow key={t.id} t={t} approve={false} bed={bed} rooms={rooms} pending={pending} run={run} />
        ))}
      </Section>

      <Section title="Ready to travel" count={counts.ready} empty="Nobody is ready to travel yet.">
        {groupByParty(q.visitsReady).map((party) => (
          <VisitParty key={party[0].group_id ?? party[0].id} party={party} approve={false} bed={bed} pending={pending} run={run} />
        ))}
        {q.tripsReady.map((t) => (
          <TripRow key={t.id} t={t} approve={false} bed={bed} rooms={rooms} pending={pending} run={run} />
        ))}
      </Section>

      {(q.visitsHistory.length > 0 || q.tripsHistory.length > 0) && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            History ({q.visitsHistory.length + q.tripsHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {q.visitsHistory.map((v) => (
              <li key={v.id}>
                {v.visitor_name} · visitor · {v.installation_name ?? "—"} · {v.depart_date} · {VISIT_STATUS_LABEL[v.status]}
              </li>
            ))}
            {q.tripsHistory.map((t) => (
              <li key={t.id}>
                {t.person_name ?? "—"} · staff · {t.installation_name ?? "—"} · {t.mobilize_date} · {OFFSHORE_STATUS_LABEL[t.status]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Inbox className="h-4 w-4 text-muted-foreground" /> {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{count}</span>
      </h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <div className="space-y-2">{children}</div>}
    </section>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

/** One visit request, or a party travelling together, decided as one. */
function VisitParty({
  party,
  approve,
  bed,
  pending,
  run,
}: {
  party: VisitRequest[];
  approve: boolean;
  bed: boolean;
  pending: boolean;
  run: Run;
}) {
  const head = party[0];
  const grouped = party.length > 1 || head.group_id != null;
  return (
    <div className={cn("rounded-lg border bg-card p-3", grouped && "space-y-2")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">Visitor{party.length > 1 ? "s" : ""}</span>
        <span className="font-medium">{party.map((v) => v.visitor_name).join(", ")}</span>
        <span className="text-xs text-muted-foreground">
          {VISITOR_TYPE_LABEL[head.visitor_type]}
          {head.visitor_company ? ` · ${head.visitor_company}` : ""}
          {" · "}
          {head.installation_name ?? "—"} · {head.depart_date}
          {head.return_date ? ` → ${head.return_date}` : ""}
          {head.host_name ? ` · host ${head.host_name}` : ""}
          {head.purpose ? ` · ${head.purpose}` : ""}
          {head.requester_name ? ` · raised by ${head.requester_name}` : ""}
        </span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium", head.status === "requested" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800")}>
          {VISIT_STATUS_LABEL[head.status]}
        </span>
        {head.status === "requested" && (
          approve ? (
            <span className="flex gap-1.5">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    head.group_id ? decideVisitGroup(head.group_id, "approved") : decideVisitRequest(head.id, "approved"),
                  )
                }
              >
                Approve
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
          ) : (
            <span className="text-xs text-muted-foreground">awaiting the OIM</span>
          )
        )}
      </div>
      {head.status !== "requested" && (
        <div className="space-y-1.5">
          {party.map((v) => (
            <VisitorBed key={v.id} v={v} bed={bed} pending={pending} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One approved visitor's bed: shown, or found and assigned by the Campboss. */
function VisitorBed({ v, bed, pending, run }: { v: VisitRequest; bed: boolean; pending: boolean; run: Run }) {
  const [options, setOptions] = useState<RoomAvailability[] | null>(null);
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
    else setOptions(res.rooms ?? []);
  }

  const needsBed = v.accommodation_required && !v.allocation;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>{v.visitor_name}</span>
        {!v.accommodation_required ? (
          <span className="text-xs text-muted-foreground">day trip, no bed needed</span>
        ) : v.allocation ? (
          <span className="text-xs">
            <BedDouble className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{v.allocation.room_label ?? "Room"}</span> · {v.allocation.from_date} → {v.allocation.to_date}
          </span>
        ) : (
          <span className="text-xs text-amber-800">no room yet</span>
        )}
        {v.accommodation_required && (
          bed ? (
            <Button size="sm" variant={needsBed ? "default" : "outline"} className="ml-auto" disabled={searching || pending} onClick={search}>
              {searching ? "Searching…" : v.allocation ? "Change room" : "Assign a room"}
            </Button>
          ) : needsBed ? (
            <span className="ml-auto text-xs text-muted-foreground">awaiting the Campboss</span>
          ) : null
        )}
      </div>
      {searchError && <p className="mt-1 text-xs text-destructive">{searchError}</p>}
      {options && (
        <div className="mt-2 rounded-md border p-2">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">No free beds for the full stay.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {options.map((r) => (
                <button
                  key={r.room_id}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => allocateVisitorBed({ visitRequestId: v.id, roomId: r.room_id }), () => setOptions(null))}
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

/** One staff trip request: HSE clearance by the OIM, a room from the Campboss. */
function TripRow({
  t,
  approve,
  bed,
  pending,
  run,
}: {
  t: OffshoreTrip;
  approve: boolean;
  bed: boolean;
  rooms: Room[];
  pending: boolean;
  run: Run;
}) {
  const [options, setOptions] = useState<RoomAvailability[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function search() {
    setSearchError(null);
    setSearching(true);
    const res = await findStaffBeds(t.id);
    setSearching(false);
    if (!res.ok) setSearchError(res.error);
    else setOptions(res.rooms);
  }
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800">Staff</span>
        <span className="font-medium">{t.person_name ?? "—"}</span>
        <span className="text-xs text-muted-foreground">
          {t.installation_name ?? "—"} · {t.mobilize_date}
          {t.demob_date ? ` → ${t.demob_date}` : ""}
          {t.flight_label ? ` · ${t.flight_label}` : ""}
        </span>
        {t.room_label ? (
          <span className="text-xs">
            <BedDouble className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{t.room_label}</span>
            {t.bed_no ? ` · ${t.bed_no}` : ""}
          </span>
        ) : t.status !== "requested" ? (
          <span className="text-xs text-amber-800">no room yet</span>
        ) : null}
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium", t.status === "requested" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800")}>
          {OFFSHORE_STATUS_LABEL[t.status]}
        </span>
        {t.status === "requested" && (
          approve ? (
            <span className="flex gap-1.5">
              <Button size="sm" disabled={pending} onClick={() => run(() => clearHse(t.id))}>
                <ShieldCheck className="h-3.5 w-3.5" /> Approve (clear HSE)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Reject ${t.person_name ?? "this"} trip request? It is cancelled.`)) run(() => setOffshoreStatus(t.id, "cancelled"));
                }}
              >
                Reject
              </Button>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">awaiting the OIM</span>
          )
        )}
        {t.status !== "requested" && (
          bed ? (
            <Button size="sm" variant={t.room_id ? "outline" : "default"} disabled={pending || searching} onClick={() => (options ? setOptions(null) : search())}>
              {searching ? "Searching…" : options ? "Cancel" : t.room_id ? "Change room" : "Assign a room"}
            </Button>
          ) : !t.room_id ? (
            <span className="text-xs text-muted-foreground">awaiting the Campboss</span>
          ) : null
        )}
      </div>
      {searchError && <p className="mt-1 text-xs text-destructive">{searchError}</p>}
      {options && (
        <div className="mt-2 rounded-md border p-2">
          <p className="mb-1.5 text-xs text-muted-foreground">
            Rooms with a free bed for {t.mobilize_date}
            {t.demob_date ? ` → ${t.demob_date}` : ""}. The lowest free berth is given on pick.
          </p>
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">No free beds for the full stay.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {options.map((r) => (
                <button
                  key={r.room_id}
                  type="button"
                  disabled={pending || r.free_beds === 0}
                  onClick={() => run(() => placeTripInRoom(t.id, r.room_id), () => setOptions(null))}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50",
                    r.own_cabin && "border-primary/50 bg-primary/5",
                    r.room_id === t.room_id && "font-semibold",
                  )}
                  title={`${r.bed_count} beds · ${r.owners} cabin owner${r.owners === 1 ? "" : "s"}`}
                >
                  {r.label} · {r.free_beds} free
                  {r.own_cabin ? " · own cabin" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone?: "amber" | "green";
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", tone === "amber" && "border-amber-200 bg-amber-50/60", tone === "green" && "border-green-200 bg-green-50/40")}>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Requests whose dates passed with nobody travelling, cleared in one go.
 * They are cancelled and drop into History; nothing is written until the
 * OIM confirms the count.
 */
function ArchivePast({ count, approve, pending, run }: { count: number; approve: boolean; pending: boolean; run: Run }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Archive className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong>{count}</strong> request{count === 1 ? "" : "s"} whose dates have passed with nobody travelling.
        {approve ? " Archive them to clear the queue; they move to History as cancelled." : " The OIM can archive them."}
      </span>
      {approve && !confirming && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(true)}>
          Archive past requests
        </Button>
      )}
      {approve && confirming && (
        <span className="flex items-center gap-2">
          <Button size="sm" disabled={pending} onClick={() => run(() => archivePastRequests({ apply: true }).then((r) => (r.ok ? { ok: true } : r)), () => setConfirming(false))}>
            {pending ? "Archiving…" : `Archive ${count}`}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </span>
      )}
    </div>
  );
}
