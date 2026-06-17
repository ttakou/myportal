"use client";

import { useMemo, useState, useTransition } from "react";
import { Play, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABEL,
  type Appraisal,
  type AppraisalCompetency,
  type AppraisalCycle,
  type AppraisalStatus,
} from "@/types/appraisal";
import {
  addCompetency,
  closeAppraisal,
  closeCycle,
  createCycle,
  hrReturnToManager,
  hrValidate,
  launchCycle,
  resolveAppeal,
  sendAppraisalReminders,
  setCompetencyActive,
} from "../actions";

export function HrConsole({
  cycles,
  appraisals,
  activeCycleId,
  competencies,
}: {
  cycles: AppraisalCycle[];
  appraisals: Appraisal[];
  activeCycleId: string | null;
  competencies: AppraisalCompetency[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();
  const [name, setName] = useState(`${year} Annual Appraisal`);
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);
  const [deadline, setDeadline] = useState("");

  const counts = useMemo(() => {
    const m = new Map<AppraisalStatus, number>();
    for (const a of appraisals) m.set(a.status, (m.get(a.status) ?? 0) + 1);
    return [...m.entries()];
  }, [appraisals]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">HR — appraisal cycles</h2>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <form
        className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            createCycle({
              name,
              year,
              periodStart: start,
              periodEnd: end,
              goalSettingDeadline: deadline || undefined,
            }),
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cycle name" required className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2" />
        <input value={start} onChange={(e) => setStart(e.target.value)} type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={end} onChange={(e) => setEnd(e.target.value)} type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" /> Create
        </Button>
        <label className="text-xs text-muted-foreground lg:col-span-2">
          Goal-setting deadline
          <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm" />
        </label>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Cycle</th>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {cycles.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {c.period_start} → {c.period_end}
                </td>
                <td className="px-4 py-2 capitalize">{c.status}</td>
                <td className="px-4 py-2 text-right">
                  {c.status === "draft" && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => launchCycle(c.id))}>
                      <Play className="h-4 w-4" /> Launch
                    </Button>
                  )}
                  {c.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => closeCycle(c.id))}
                    >
                      <Lock className="h-4 w-4" /> Close
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {cycles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No cycles yet — create one to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeCycleId && appraisals.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Completion — active cycle ({appraisals.length} employees)</h3>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendAppraisalReminders())}>
              Send reminders
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.map(([status, n]) => (
              <span key={status} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {STATUS_LABEL[status]}: <span className="font-semibold">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <HrQueue appraisals={appraisals} />
      <CompetencyEditor competencies={competencies} />
    </section>
  );
}

function CompetencyEditor({ competencies }: { competencies: AppraisalCompetency[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Competency framework</h3>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="mb-2 flex flex-wrap gap-2">
        {competencies.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() => run(() => setCompetencyActive(c.id, !c.is_active))}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              c.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground line-through"
            }`}
            title={c.is_active ? "Active — click to retire" : "Retired — click to reactivate"}
          >
            {c.name}
          </button>
        ))}
        {competencies.length === 0 && (
          <span className="text-xs text-muted-foreground">No competencies defined yet.</span>
        )}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addCompetency({ name }), () => setName(""));
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New competency (e.g. Teamwork)"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
    </div>
  );
}

function HrQueue({ appraisals }: { appraisals: Appraisal[] }) {
  const toValidate = appraisals.filter(
    (a) => a.stage === "hr_review" && a.status === "pending_hr_review",
  );
  const toClose = appraisals.filter(
    (a) => a.stage !== "closed" && ["completed", "under_appeal"].includes(a.status),
  );
  if (toValidate.length === 0 && toClose.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">HR actions</h3>
      <ul className="divide-y">
        {toValidate.map((a) => (
          <HrRow key={a.id} a={a} kind="validate" />
        ))}
        {toClose.map((a) => (
          <HrRow key={a.id} a={a} kind="close" />
        ))}
      </ul>
    </div>
  );
}

function HrRow({ a, kind }: { a: Appraisal; kind: "validate" | "close" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState("");
  const openAppeal = a.appeal && a.appeal.status === "open" ? a.appeal : null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <span className="font-medium">{a.employee_name || "—"}</span>
          {a.overall_rating != null ? (
            <span className="ml-2 text-xs text-muted-foreground">overall {a.overall_rating}</span>
          ) : null}
          {a.status === "under_appeal" ? (
            <span className="ml-2 text-xs text-amber-700">disputed</span>
          ) : null}
        </span>
        <div className="flex gap-2">
          {kind === "validate" && !returning && (
            <>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setReturning(true)}>
                Return
              </Button>
              <Button size="sm" disabled={pending} onClick={() => run(() => hrValidate(a.id))}>
                Validate
              </Button>
            </>
          )}
          {kind === "close" && (
            <Button size="sm" disabled={pending} onClick={() => run(() => closeAppraisal(a.id))}>
              Close
            </Button>
          )}
        </div>
      </div>
      {openAppeal && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="text-xs text-amber-800">
            <span className="font-medium">Appeal: </span>
            {openAppeal.reason || "No reason given."}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="Decision / outcome"
              className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !decision.trim()}
              onClick={() => run(() => resolveAppeal({ appraisalId: a.id, decision }))}
            >
              Record decision
            </Button>
          </div>
        </div>
      )}
      {returning && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What needs correcting?"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !comment.trim()}
            onClick={() => run(() => hrReturnToManager({ appraisalId: a.id, comment }))}
          >
            Send to manager
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setReturning(false)}>
            Cancel
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </li>
  );
}
