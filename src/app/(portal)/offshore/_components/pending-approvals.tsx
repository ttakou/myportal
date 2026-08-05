"use client";

import Link from "next/link";
import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OffshoreTrip, VisitRequest } from "@/types/offshore";
import { clearHse, decideVisitGroup, decideVisitRequest } from "../actions";

/** Group visit requests by their shared group_id (single requests stand alone). */
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

/**
 * Everything waiting on an approver's decision, surfaced where the OIM /
 * Campboss actually lands: visit requests awaiting approval (decided inline)
 * and trip requests awaiting HSE clearance. Renders nothing when the queue is
 * empty.
 */
export function PendingApprovals({
  visits,
  trips,
  canDecide = true,
}: {
  visits: VisitRequest[];
  trips: OffshoreTrip[];
  /**
   * False for viewers who can SEE the queue but not decide it — a registrar
   * holds the offshore `create` verb, while decideVisitRequest requires
   * `approve`. Showing them buttons that fail server-side is worse than
   * showing none.
   */
  canDecide?: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const pendingVisits = visits.filter((v) => v.status === "requested");
  const pendingTrips = trips.filter((t) => t.status === "requested");
  if (pendingVisits.length === 0 && pendingTrips.length === 0) return null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <CheckCircle2 className="h-4 w-4" />
        {canDecide ? "Pending your approval" : "Awaiting approval"}
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs tabular-nums">
          {pendingVisits.length + pendingTrips.length}
        </span>
      </h3>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">{error}</p>}

      {pendingVisits.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Visit requests ({pendingVisits.length})
          </p>
          {groupVisits(pendingVisits).map((g) => {
            const head = g[0];
            const names = g.map((v) => v.visitor_name).join(", ");
            return (
              <div
                key={head.group_id ?? head.id}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">{names}</span>
                {head.visitor_company && (
                  <span className="text-xs text-muted-foreground">{head.visitor_company}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {head.installation_name ?? "—"} · {head.depart_date}
                  {head.return_date ? ` → ${head.return_date}` : ""}
                  {head.host_name ? ` · host ${head.host_name}` : ""}
                  {head.purpose ? ` · ${head.purpose}` : ""}
                </span>
                <span className="ml-auto flex gap-1.5">
                  {!canDecide && (
                    <span className="self-center text-xs text-muted-foreground">
                      awaiting the OIM
                    </span>
                  )}
                  {canDecide && (
                  <>
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
                  </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {pendingTrips.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Trip requests awaiting HSE clearance ({pendingTrips.length})
          </p>
          {pendingTrips.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <span className="font-medium">{t.person_name ?? "—"}</span>
              <span className="text-xs text-muted-foreground">
                {t.installation_name ?? "—"} · {t.mobilize_date}
                {t.demob_date ? ` → ${t.demob_date}` : ""}
              </span>
              <span className="ml-auto">
                {canDecide ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => clearHse(t.id))}>
                    <ShieldCheck className="h-3.5 w-3.5" /> Clear HSE
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">awaiting HSE clearance</span>
                )}
              </span>
            </div>
          ))}
          <Link
            href="/offshore?view=trips"
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Open all trips →
          </Link>
        </div>
      )}
    </section>
  );
}
