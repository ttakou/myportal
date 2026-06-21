"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { ShieldAlert, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PIP_STATUS_LABEL, type Pip, type PipData, type PipStatus } from "@/types/pip";
import { createPip, setPipStatus } from "../pip-actions";

const STATUS_STYLE: Record<PipStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  met: "bg-green-100 text-green-700",
  not_met: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function PipPanel({
  data,
  employees,
}: {
  data: PipData;
  employees: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // New-PIP form
  const [employeeId, setEmployeeId] = useState("");
  const [concern, setConcern] = useState("");
  const [expectations, setExpectations] = useState("");
  const [support, setSupport] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  // Nothing to show: no PIPs and the viewer can't raise one.
  if (data.pips.length === 0 && !data.canManage) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert className="h-5 w-5 text-amber-600" /> Performance improvement plans
        </h2>
        {data.canManage && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setAdding((a) => !a)}>
            <Plus className="h-4 w-4" /> Raise a PIP
          </Button>
        )}
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {adding && data.canManage && (
        <form
          className="space-y-2 rounded-lg border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createPip({ employeeId, concern, expectations, support, reviewDate }),
              () => {
                setAdding(false);
                setEmployeeId("");
                setConcern("");
                setExpectations("");
                setSupport("");
                setReviewDate("");
              },
            );
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Employee
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Select…</option>
                {employees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Review date
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <textarea
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
            required
            rows={2}
            placeholder="Performance concern *"
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={expectations}
            onChange={(e) => setExpectations(e.target.value)}
            rows={2}
            placeholder="Expected improvement / measures"
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={support}
            onChange={(e) => setSupport(e.target.value)}
            rows={2}
            placeholder="Support offered"
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending || !employeeId || !concern.trim()}>
              Open PIP
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {data.pips.map((p) => (
          <PipRow key={p.id} pip={p} canManage={data.canManage && !p.is_own} pending={pending} run={run} />
        ))}
        {data.pips.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No performance improvement plans.
          </p>
        )}
      </div>
    </section>
  );
}

function PipRow({
  pip,
  canManage,
  pending,
  run,
}: {
  pip: Pip;
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [outcome, setOutcome] = useState(pip.outcome ?? "");
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{pip.is_own ? "Your PIP" : pip.employee_name ?? "—"}</div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            STATUS_STYLE[pip.status],
          )}
        >
          {PIP_STATUS_LABEL[pip.status]}
        </span>
      </div>
      <p className="mt-1 text-sm">{pip.concern}</p>
      {pip.expectations && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium">Expected:</span> {pip.expectations}
        </p>
      )}
      {pip.support && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-medium">Support:</span> {pip.support}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Started {pip.start_date}
        {pip.review_date ? ` · review ${pip.review_date}` : ""}
        {pip.manager_name ? ` · ${pip.manager_name}` : ""}
      </p>
      {pip.outcome && (
        <p className="mt-1 text-xs">
          <span className="font-medium">Outcome:</span> {pip.outcome}
        </p>
      )}

      {canManage && pip.status === "open" && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <input
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="Outcome / notes (optional)"
            className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setPipStatus({ pipId: pip.id, status: "cancelled", outcome }))}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setPipStatus({ pipId: pip.id, status: "not_met", outcome }))}
            >
              Not met
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => setPipStatus({ pipId: pip.id, status: "met", outcome }))}
            >
              Met
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
