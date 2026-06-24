"use client";

import { useState } from "react";
import { Inbox, UserPlus } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  REQUEST_ORIGIN_LABEL,
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  type RequestStatus,
  type RequestType,
} from "@/types/training";
import type { TeamRequestRow } from "@/lib/training";
import { decideTrainingRequest, managerRequestForEmployee } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const STATUS_STYLE: Record<RequestStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  manager_approved: "bg-sky-100 text-sky-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function TeamRequestsPanel({
  requests,
  reports,
  courses,
}: {
  requests: TeamRequestRow[];
  reports: { id: string; name: string }[];
  courses: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [reason, setReason] = useState("");
  const [period, setPeriod] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }

  const pendingCount = requests.filter((r) => r.status === "requested").length;

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Inbox className="h-5 w-5 text-primary" /> Training Requests
          </h2>
          <p className="text-sm text-muted-foreground">
            {pendingCount} awaiting your decision · approve to pass to HR for scheduling.
          </p>
        </div>
        {reports.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            <UserPlus className="mr-1 h-4 w-4" /> Request for a report
          </Button>
        )}
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {open && (
        <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Team member
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
              <option value="">— choose —</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Course (catalogue)
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                if (e.target.value) setCourseTitle("");
              }}
              className={cn(field, "mt-0.5 block w-full")}
            >
              <option value="">— choose / or describe —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            …or new training
            <input
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              disabled={!!courseId}
              className={cn(field, "mt-0.5 block w-full disabled:opacity-50")}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Preferred period
            <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Q3" className={cn(field, "mt-0.5 block w-full")} />
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">
            Reason / justification
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={cn(field, "mt-0.5 block w-full")} />
          </label>
          <div className="flex items-end sm:col-span-2">
            <Button
              size="sm"
              disabled={pending || !profileId || (!courseId && !courseTitle.trim())}
              onClick={() =>
                run(
                  () =>
                    managerRequestForEmployee({
                      profileId,
                      courseId: courseId || null,
                      courseTitle,
                      reason,
                      preferredPeriod: period,
                    }),
                  () => {
                    setOpen(false);
                    setProfileId("");
                    setCourseId("");
                    setCourseTitle("");
                    setReason("");
                    setPeriod("");
                  },
                )
              }
            >
              Raise request
            </Button>
            <span className="ml-3 self-center text-xs text-muted-foreground">
              Manager requests are pre-endorsed and go straight to HR.
            </span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">Type</th>
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
                <td className="px-4 py-2 text-muted-foreground">
                  {r.request_type
                    ? REQUEST_TYPE_LABEL[r.request_type as RequestType]
                    : r.origin
                      ? REQUEST_ORIGIN_LABEL[r.origin]
                      : "—"}
                </td>
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
