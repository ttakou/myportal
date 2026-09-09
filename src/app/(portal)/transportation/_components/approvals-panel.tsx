"use client";

import { useState } from "react";
import Link from "next/link";
import { useStatusTransition } from "@/components/activity";
import { CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TransportRequest } from "@/types/transport";
import { decideTransportRequest } from "../actions";
import { FollowUps, TypeBadge, fmt } from "./task-bits";

/**
 * Ride requests waiting on a line manager. A manager sees their own
 * reports' requests (and a delegate their delegator's), an admin
 * everyone's; approving sends the request to the dispatch desk, rejecting
 * cancels it with the reason on its thread. A return trip is two legs
 * decided as one. Past the tenant's escalation delay the desk takes over.
 */
export function ApprovalsPanel({
  requests,
  approvalOn,
  escalationHours,
}: {
  requests: TransportRequest[];
  approvalOn: boolean;
  escalationHours: number;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function decide(id: string, decision: "approve" | "reject") {
    const reason = decision === "reject" ? (prompt("Reason for rejecting?") ?? undefined) : undefined;
    if (decision === "reject" && reason === undefined) return;
    setError(null);
    startTransition(async () => {
      const res = await decideTransportRequest(id, decision, reason);
      if (!res.ok) setError(res.error ?? "Could not save the decision.");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="h-5 w-5 text-primary" /> Approvals
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{requests.length}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {approvalOn
            ? `Ride requests from your direct reports wait here before the dispatch desk sees them.${
                escalationHours > 0 ? ` One left unanswered for ${escalationHours} hours goes to the desk on its own.` : ""
              }`
            : "Approval is switched off for this organisation: requests go straight to the dispatch desk. An admin turns it on under Admin Center › Modules › Transportation."}
        </p>
        {approvalOn && (
          <p className="mt-1 text-xs text-muted-foreground">
            Going on leave? Under{" "}
            <Link href="/account" className="font-medium text-primary hover:underline">
              Account › Delegate my access
            </Link>{" "}
            a colleague decides these for you for the dates you set.
          </p>
        )}
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {requests.length === 0 ? (
        <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">Nothing waiting for your approval.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={r.task_type} />
                {(r.return_of || requests.some((x) => x.return_of === r.id)) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium" title="Approving one leg approves both">
                    <Undo2 className="h-3 w-3" /> {r.return_of ? "Return leg" : "With return"}
                  </span>
                )}
                <span className="font-medium">{r.requester_name ?? "—"}</span>
                <span className="text-sm">
                  {r.pickup} → {r.dropoff}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmt(r.depart_at)} · {r.passengers} pax
                  {r.purpose ? ` · ${r.purpose}` : ""} · waiting {waitingFor(r.created_at)}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" disabled={pending} onClick={() => decide(r.id, "approve")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(r.id, "reject")}>
                    Reject
                  </Button>
                </span>
              </div>
              <FollowUps task={r} canPost />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "3 h", "2 days": how long a request has waited. */
function waitingFor(createdAt: string): string {
  const h = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 3_600_000));
  if (h < 1) return "under an hour";
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}
