"use client";

import { useState } from "react";
import { Compass } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS_LABEL, type DevelopmentPlanItem, type RequestStatus } from "@/types/training";
import { submitTrainingRequest } from "../actions";

const field = "rounded-md border bg-background px-2 py-1 text-sm";

const STATUS_STYLE: Record<RequestStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  manager_approved: "bg-sky-100 text-sky-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const IDP_STATUS_LABEL: Record<DevelopmentPlanItem["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

function fmtDate(d: string | null) {
  return d ? new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function IdpPanel({
  items,
  courses,
}: {
  items: DevelopmentPlanItem[];
  courses: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  function request(item: DevelopmentPlanItem) {
    setError(null);
    const courseId = picked[item.id] || "";
    startTransition(async () => {
      const res = await submitTrainingRequest({
        courseId: courseId || null,
        courseTitle: courseId ? "" : item.area,
        reason: item.action ?? `Development plan: ${item.area}`,
        origin: "personal_development_plan",
        developmentPlanId: item.id,
      });
      if (!res.ok) setError(res.error ?? "Failed.");
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Compass className="h-5 w-5 text-primary" /> Individual Development Plan
        </h2>
        <p className="text-sm text-muted-foreground">
          Development actions from your appraisal. Raise a training request straight from a plan item.
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No development plan items yet. They come from your performance appraisal.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Area</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Training request</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t align-top">
                  <td className="px-4 py-2 font-medium">{i.area}</td>
                  <td className="px-4 py-2 text-muted-foreground">{i.action ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(i.target_date)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{IDP_STATUS_LABEL[i.status]}</td>
                  <td className="px-4 py-2">
                    {i.request_status ? (
                      <div className="flex justify-end">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[i.request_status])}>
                          {REQUEST_STATUS_LABEL[i.request_status]}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={picked[i.id] ?? ""}
                          onChange={(e) => setPicked((p) => ({ ...p, [i.id]: e.target.value }))}
                          className={field}
                        >
                          <option value="">Use plan area</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" disabled={pending} onClick={() => request(i)}>
                          Request
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
