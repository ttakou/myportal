"use client";

import { useMemo, useState, useTransition } from "react";
import { Play, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RATING_BANDS,
  STATUS_LABEL,
  type Appraisal,
  type AppraisalCompetency,
  type AppraisalCycle,
  type AppraisalStatus,
  type DepartmentObjective,
  type RatingBand,
} from "@/types/appraisal";
import {
  addCompetency,
  addDepartmentObjective,
  closeAppraisal,
  closeCycle,
  createCycle,
  hrReturnToManager,
  hrValidate,
  launchCycle,
  resolveAppeal,
  sendAppraisalReminders,
  setCompetencyActive,
  setDepartmentObjectiveActive,
  updateCycleBands,
} from "../actions";

export function HrConsole({
  cycles,
  appraisals,
  activeCycleId,
  competencies,
  departmentObjectives,
}: {
  cycles: AppraisalCycle[];
  appraisals: Appraisal[];
  activeCycleId: string | null;
  competencies: AppraisalCompetency[];
  departmentObjectives: DepartmentObjective[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();
  const [name, setName] = useState(`${year} Annual Appraisal`);
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);
  const [deadline, setDeadline] = useState("");
  const [wOkr, setWOkr] = useState("70");
  const [wComp, setWComp] = useState("20");
  const [wDev, setWDev] = useState("10");
  const [requireSecond, setRequireSecond] = useState(false);
  const [bands, setBands] = useState<RatingBand[]>(RATING_BANDS);

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
              weightOkr: Number(wOkr),
              weightCompetency: Number(wComp),
              weightDevelopment: Number(wDev),
              requireSecondLevel: requireSecond,
              ratingBands: bands,
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
        <div className="flex items-end gap-2 lg:col-span-3">
          <label className="text-xs text-muted-foreground">
            OKR %
            <input value={wOkr} onChange={(e) => setWOkr(e.target.value)} type="number" min={0} max={100} className="mt-1 block w-20 rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Competency %
            <input value={wComp} onChange={(e) => setWComp(e.target.value)} type="number" min={0} max={100} className="mt-1 block w-24 rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Development %
            <input value={wDev} onChange={(e) => setWDev(e.target.value)} type="number" min={0} max={100} className="mt-1 block w-24 rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="flex items-center gap-2 self-end text-xs text-muted-foreground">
            <input type="checkbox" checked={requireSecond} onChange={(e) => setRequireSecond(e.target.checked)} />
            Require second-level approval
          </label>
        </div>
        <div className="lg:col-span-5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Rating bands — final score (%) maps to the highest threshold it meets
          </p>
          <BandsEditor value={bands} onChange={setBands} disabled={pending} />
        </div>
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
      {cycles.length > 0 && <RatingBandsManager cycles={cycles} />}
      <DepartmentObjectivesEditor objectives={departmentObjectives} />
      <CompetencyEditor competencies={competencies} />
    </section>
  );
}

/** HR maintains the library of department / company objectives employees align to. */
function DepartmentObjectivesEditor({ objectives }: { objectives: DepartmentObjective[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");

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
      <h3 className="mb-2 text-sm font-semibold">Department objectives</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Employees align their goals to these. Leave department blank for company-wide.
      </p>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      {objectives.length > 0 && (
        <ul className="mb-3 divide-y">
          {objectives.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className={`font-medium ${o.is_active ? "" : "text-muted-foreground line-through"}`}>
                  <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {o.department || "All"}
                  </span>
                  {o.title}
                </div>
                {o.description && <div className="text-xs text-muted-foreground">{o.description}</div>}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setDepartmentObjectiveActive(o.id, !o.is_active))}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              >
                {o.is_active ? "Retire" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addDepartmentObjective({ title, department: department || undefined, description: description || undefined }),
            () => {
              setTitle("");
              setDepartment("");
              setDescription("");
            },
          );
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Objective title" required className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2" />
        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department (blank = all)" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <Button type="submit" size="sm" disabled={pending || !title.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-4" />
      </form>
    </div>
  );
}

/** Edit an existing cycle's rating bands. */
function RatingBandsManager({ cycles }: { cycles: AppraisalCycle[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? "");
  const selected = cycles.find((c) => c.id === cycleId) ?? cycles[0];
  const [bands, setBands] = useState<RatingBand[]>(
    selected?.rating_bands?.length ? selected.rating_bands : RATING_BANDS,
  );

  function selectCycle(id: string) {
    setCycleId(id);
    setSaved(false);
    setError(null);
    const c = cycles.find((x) => x.id === id);
    setBands(c?.rating_bands?.length ? c.rating_bands : RATING_BANDS);
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateCycleBands({ cycleId, bands });
      if (!res.ok) setError(res.error ?? "Action failed.");
      else setSaved(true);
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Rating bands</h3>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={cycleId}
          onChange={(e) => selectCycle(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {saved && <span className="text-xs text-green-600">Saved</span>}
      </div>
      <BandsEditor value={bands} onChange={(b) => { setBands(b); setSaved(false); }} disabled={pending} />
      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={pending} onClick={save}>
          Save bands
        </Button>
      </div>
    </div>
  );
}

/** Reusable editor for an ordered list of { min, label } rating bands. */
function BandsEditor({
  value,
  onChange,
  disabled,
}: {
  value: RatingBand[];
  onChange: (bands: RatingBand[]) => void;
  disabled?: boolean;
}) {
  function update(i: number, patch: Partial<RatingBand>) {
    onChange(value.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...value, { min: 0, label: "" }]);
  }

  return (
    <div className="space-y-1">
      {value.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            value={b.min}
            disabled={disabled}
            onChange={(e) => update(i, { min: Number(e.target.value) })}
            className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">% and above →</span>
          <input
            value={b.label}
            disabled={disabled}
            placeholder="Label (e.g. Meets Expectations)"
            onChange={(e) => update(i, { label: e.target.value })}
            className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
          />
          <button
            type="button"
            aria-label="Remove band"
            disabled={disabled || value.length <= 1}
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Add band
      </button>
    </div>
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

/** Confidential stakeholder feedback per goal (HR view during validation). */
function StakeholderFeedback({ appraisal }: { appraisal: Appraisal }) {
  const goals = appraisal.goals.filter((g) => g.raters.length > 0);
  if (goals.length === 0) return null;
  return (
    <div className="mt-2 rounded-md bg-muted/50 px-2 py-1 text-xs">
      <span className="font-medium">Stakeholder feedback</span>
      <span className="text-muted-foreground"> (confidential)</span>
      <ul className="mt-0.5 space-y-0.5">
        {goals.map((g) => (
          <li key={g.id}>
            <span className="text-foreground">{g.title}</span>
            {": "}
            {g.raters
              .map((r) =>
                r.status === "submitted"
                  ? `${r.rater_name ?? "—"} ${r.rating ?? "—"}/5${r.comment ? ` (${r.comment})` : ""}`
                  : `${r.rater_name ?? "—"} — awaiting`,
              )
              .join("; ")}
          </li>
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
          {a.final_score != null ? (
            <span className="ml-2 text-xs text-muted-foreground">
              {a.final_score}% · {a.rating_label}
            </span>
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
      {kind === "validate" && <StakeholderFeedback appraisal={a} />}
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
