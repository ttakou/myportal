"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  VISIT_STATUS_LABEL,
  VISITOR_TYPE_LABEL,
  type Room,
  type RoomAvailability,
  type VisitRequest,
  type VisitStatus,
} from "@/types/offshore";
import {
  allocateVisitorBed,
  decideVisitRequest,
  decideVisitGroup,
  findAvailableBeds,
  setVisitorMovement,
} from "../../actions";
import { useRun } from "./shared";

/**
 * Visitors: visit requests grouped by party, with approval and bedding.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

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

export function VisitorsPanel({ visits }: { visits: VisitRequest[] }) {
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
