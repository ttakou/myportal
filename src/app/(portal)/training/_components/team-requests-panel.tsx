"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REQUEST_ORIGIN_LABEL, REQUEST_STATUS_LABEL, type RequestStatus } from "@/types/training";
import type { TeamRequestRow } from "@/lib/training";
import { decideTrainingRequest } from "../actions";

const STATUS_STYLE: Record<RequestStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  manager_approved: "bg-sky-100 text-sky-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function TeamRequestsPanel({ requests }: { requests: TeamRequestRow[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
    });
  }

  const pendingCount = requests.filter((r) => r.status === "requested").length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Inbox className="h-5 w-5 text-primary" /> Training Requests
        </h2>
        <p className="text-sm text-muted-foreground">
          {pendingCount} awaiting your decision · approve to pass to HR for scheduling.
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">Origin</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Decision</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-medium">{r.requester}</td>
                <td className="px-4 py-2">{r.course_title ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.origin ? REQUEST_ORIGIN_LABEL[r.origin] : "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.reason ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])}>
                    {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {r.status === "requested" ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" disabled={pending} onClick={() => run(() => decideTrainingRequest(r.id, "approve"))}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideTrainingRequest(r.id, "reject"))}>
                        Decline
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No requests from your team.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
