"use client";

import { useState } from "react";
import { FilePlus2, X } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS_LABEL, type RequestStatus, type TrainingRequest } from "@/types/training";
import { cancelTrainingRequest, submitTrainingRequest } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const STATUS_STYLE: Record<RequestStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  manager_approved: "bg-sky-100 text-sky-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function RequestPanel({
  requests,
  courses,
}: {
  requests: TrainingRequest[];
  courses: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
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

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FilePlus2 className="h-5 w-5 text-primary" /> Individual Training Requests
        </h2>
        <p className="text-sm text-muted-foreground">Request a course from the catalogue or describe new training.</p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2">
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
            <option value="">— choose / or describe below —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          …or new training (free text)
          <input
            value={courseTitle}
            onChange={(e) => setCourseTitle(e.target.value)}
            disabled={!!courseId}
            placeholder="e.g. Advanced rigging"
            className={cn(field, "mt-0.5 block w-full disabled:opacity-50")}
          />
        </label>
        <label className="text-xs text-muted-foreground sm:col-span-2">
          Reason / justification
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className={cn(field, "mt-0.5 block w-full")}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Preferred period
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="e.g. Q3, September"
            className={cn(field, "mt-0.5 block w-full")}
          />
        </label>
        <div className="flex items-end">
          <Button
            size="sm"
            disabled={pending || (!courseId && !courseTitle.trim())}
            onClick={() =>
              run(
                () =>
                  submitTrainingRequest({
                    courseId: courseId || null,
                    courseTitle,
                    reason,
                    preferredPeriod: period,
                  }),
                () => {
                  setCourseId("");
                  setCourseTitle("");
                  setReason("");
                  setPeriod("");
                },
              )
            }
          >
            Submit request
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-medium">{r.course_title ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.reason ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])}>
                    {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                  {r.decision_note && <span className="ml-2 text-xs text-muted-foreground">{r.decision_note}</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  {(r.status === "requested" || r.status === "manager_approved") && (
                    <button
                      disabled={pending}
                      title="Cancel request"
                      onClick={() => run(() => cancelTrainingRequest(r.id))}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
