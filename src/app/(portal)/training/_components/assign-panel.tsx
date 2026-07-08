"use client";

import { useState } from "react";
import { ClipboardPlus } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  type RequestStatus,
  type RequestType,
} from "@/types/training";
import type { AdminRequestRow } from "@/lib/training";
import { assignTraining, decideTrainingRequest } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const STATUS_STYLE: Record<RequestStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  manager_approved: "bg-sky-100 text-sky-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

// The three HR-raised flavours and how they behave.
const ADMIN_TYPES: { key: "departmental" | "statutory" | "adhoc"; blurb: string }[] = [
  { key: "departmental", blurb: "A Requested proposal for everyone in a department — still needs approval." },
  { key: "statutory", blurb: "An approved mandatory assignment; seeds the plan as statutory." },
  { key: "adhoc", blurb: "An approved one-off assignment; seeds the plan." },
];

export function AssignPanel({
  requests,
  courses,
  employees,
  departments,
}: {
  requests: AdminRequestRow[];
  courses: { id: string; title: string }[];
  employees: { id: string; name: string }[];
  departments: string[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [type, setType] = useState<"departmental" | "statutory" | "adhoc">("statutory");
  const [scope, setScope] = useState<"person" | "department">("department");
  const [profileId, setProfileId] = useState("");
  const [department, setDepartment] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [reason, setReason] = useState("");
  const [period, setPeriod] = useState("");

  // Departmental requests are inherently population-wide.
  const effectiveScope = type === "departmental" ? "department" : scope;

  const pendingApprovals = requests.filter((r) => r.status === "requested" || r.status === "manager_approved").length;

  function decide(id: string, decision: "approve" | "reject") {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await decideTrainingRequest(id, decision);
      if (!res.ok) setError(res.error ?? "Failed.");
    });
  }

  function submit() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await assignTraining({
        type,
        scope: effectiveScope,
        profileId: effectiveScope === "person" ? profileId : null,
        department: effectiveScope === "department" ? department : null,
        courseId: courseId || null,
        courseTitle,
        reason,
        preferredPeriod: period,
      });
      if (!res.ok) setError(res.error ?? "Failed.");
      else {
        setInfo(
          `Created ${res.created ?? 0}${res.skipped ? ` · skipped ${res.skipped} (already had a live request)` : ""}.`,
        );
        setCourseId("");
        setCourseTitle("");
        setReason("");
        setPeriod("");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardPlus className="h-5 w-5 text-primary" /> Assign / Request Training
        </h2>
        <p className="text-sm text-muted-foreground">
          Raise departmental requests or assign statutory / ad hoc training for an individual or a whole department.
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {info && <p className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-700">{info}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Request type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className={cn(field, "mt-0.5 block w-full")}
          >
            {ADMIN_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {REQUEST_TYPE_LABEL[t.key as RequestType]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end text-xs text-muted-foreground">
          {ADMIN_TYPES.find((t) => t.key === type)?.blurb}
        </div>

        <label className="text-xs text-muted-foreground">
          Target
          <select
            value={effectiveScope}
            disabled={type === "departmental"}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            className={cn(field, "mt-0.5 block w-full disabled:opacity-60")}
          >
            <option value="department">A whole department</option>
            <option value="person">One employee</option>
          </select>
        </label>
        {effectiveScope === "department" ? (
          <label className="text-xs text-muted-foreground">
            Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
              <option value="">— choose —</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-xs text-muted-foreground">
            Employee
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
              <option value="">— choose —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}

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
          <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Q3, 2026" className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Reason / note
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>

        <div className="flex items-end sm:col-span-2">
          <Button
            size="sm"
            disabled={
              pending ||
              (!courseId && !courseTitle.trim()) ||
              (effectiveScope === "department" ? !department : !profileId)
            }
            onClick={submit}
          >
            {type === "departmental" ? "Raise departmental request" : "Assign training"}
          </Button>
          <span className="ml-3 self-center text-xs text-muted-foreground">
            People who already have a live request for the course are skipped.
          </span>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Requests &amp; assignments
          {pendingApprovals > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pendingApprovals} awaiting approval
            </span>
          )}
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Raised</th>
                <th className="px-4 py-2 font-medium text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const pendingRow = r.status === "requested" || r.status === "manager_approved";
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.person}</td>
                    <td className="px-4 py-2">{r.course_title ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {r.request_type ? REQUEST_TYPE_LABEL[r.request_type as RequestType] : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])}>
                        {REQUEST_STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {pendingRow ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" disabled={pending} onClick={() => decide(r.id, "approve")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(r.id, "reject")}>
                            Decline
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
