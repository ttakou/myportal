"use client";

import { useState, useTransition } from "react";
import { Plus, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/components/permissions-provider";
import {
  NINE_BOX_LABELS,
  type Feedback,
  type NineBoxCell,
  type Objective,
} from "@/types/performance";
import {
  addKeyResult,
  closeObjective,
  createObjective,
  giveFeedback,
  setNineBox,
  updateKeyResult,
} from "../actions";

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

export function PerformanceBoard({
  objectives,
  feedback,
  users,
  nineBox,
  isAdmin,
}: {
  objectives: Objective[];
  feedback: Feedback[];
  users: { id: string; name: string }[];
  nineBox: NineBoxCell[];
  isAdmin: boolean;
}) {
  const { can } = usePermissions();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [objTitle, setObjTitle] = useState("");
  const [objPeriod, setObjPeriod] = useState("Q2 2026");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {/* OKRs */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My OKRs</h2>
        {can("performance", "create") && (
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => createObjective({ title: objTitle, period: objPeriod }), () => setObjTitle("")); }}
          className="flex flex-wrap gap-2 rounded-lg border bg-card p-4"
        >
          <input value={objTitle} onChange={(e) => setObjTitle(e.target.value)} placeholder="New objective" required className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={objPeriod} onChange={(e) => setObjPeriod(e.target.value)} placeholder="Period" className="w-28 rounded-md border bg-background px-3 py-2 text-sm" />
          <Button type="submit" disabled={pending}><Target className="h-4 w-4" /> Add objective</Button>
        </form>
        )}

        {objectives.map((o) => (
          <ObjectiveCard key={o.id} objective={o} pending={pending} run={run} />
        ))}
        {objectives.length === 0 && <p className="text-sm text-muted-foreground">No objectives yet.</p>}
      </section>

      {/* Continuous feedback */}
      <FeedbackSection feedback={feedback} users={users} pending={pending} run={run} />

      {/* 9-box */}
      {isAdmin && <NineBox cells={nineBox} users={users} pending={pending} run={run} />}
    </div>
  );
}

function ObjectiveCard({ objective: o, pending, run }: { objective: Objective; pending: boolean; run: Runner }) {
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("100");
  const [krUnit, setKrUnit] = useState("");
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{o.title} <span className="text-xs font-normal text-muted-foreground">· {o.period}</span></p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${o.progress}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{o.progress}%</span>
          </div>
        </div>
        {o.status === "active" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeObjective(o.id))}>Close</Button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {o.key_results.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{k.title}</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                defaultValue={k.current}
                disabled={pending}
                onBlur={(e) => { const v = Number(e.target.value); if (v !== k.current) run(() => updateKeyResult(k.id, v)); }}
                className="w-20 rounded-md border bg-background px-2 py-1 text-right text-sm"
              />
              <span className="text-xs text-muted-foreground">/ {k.target}{k.unit ?? ""}</span>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <input value={krTitle} onChange={(e) => setKrTitle(e.target.value)} placeholder="Add key result" className="flex-1 rounded-md border bg-background px-2 py-1 text-sm" />
          <input value={krTarget} onChange={(e) => setKrTarget(e.target.value)} type="number" placeholder="Target" className="w-20 rounded-md border bg-background px-2 py-1 text-sm" />
          <input value={krUnit} onChange={(e) => setKrUnit(e.target.value)} placeholder="Unit" className="w-16 rounded-md border bg-background px-2 py-1 text-sm" />
          <Button size="sm" variant="outline" disabled={pending || !krTitle.trim()} onClick={() => run(() => addKeyResult({ objectiveId: o.id, title: krTitle, target: Number(krTarget), unit: krUnit }), () => { setKrTitle(""); setKrTarget("100"); setKrUnit(""); })}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

function FeedbackSection({ feedback, users, pending, run }: { feedback: Feedback[]; users: { id: string; name: string }[]; pending: boolean; run: Runner }) {
  const { can } = usePermissions();
  const [toId, setToId] = useState(users[0]?.id ?? "");
  const [body, setBody] = useState("");
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Continuous feedback</h2>
      {can("performance", "create") && (
      <form
        onSubmit={(e) => { e.preventDefault(); run(() => giveFeedback(toId, body), () => setBody("")); }}
        className="flex flex-wrap gap-2 rounded-lg border bg-card p-4"
      >
        <select value={toId} onChange={(e) => setToId(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-sm">
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share feedback…" className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
        <Button type="submit" disabled={pending}>Send</Button>
      </form>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Received</p>
        {feedback.map((f) => (
          <div key={f.id} className="rounded-lg border p-3 text-sm">
            <p>{f.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">— {f.from_name ?? "Someone"} · {new Date(f.created_at).toLocaleDateString()}</p>
          </div>
        ))}
        {feedback.length === 0 && <p className="text-sm text-muted-foreground">No feedback yet.</p>}
      </div>
    </section>
  );
}

function NineBox({ cells, users, pending, run }: { cells: NineBoxCell[]; users: { id: string; name: string }[]; pending: boolean; run: Runner }) {
  const [profileId, setProfileId] = useState(users[0]?.id ?? "");
  const [perf, setPerf] = useState("2");
  const [pot, setPot] = useState("2");

  const at = (performance: number, potential: number) =>
    cells.filter((c) => c.performance === performance && c.potential === potential);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">9-box grid</h2>
      <div className="grid grid-cols-3 gap-2">
        {[3, 2, 1].map((potential) =>
          [1, 2, 3].map((performance) => {
            const people = at(performance, potential);
            return (
              <div key={`${performance}-${potential}`} className="min-h-[84px] rounded-lg border bg-card p-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {NINE_BOX_LABELS[`${performance}-${potential}`]}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {people.map((p) => (
                    <span key={p.profile_id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{p.person_name}</span>
                  ))}
                </div>
              </div>
            );
          }),
        )}
      </div>
      <p className="text-xs text-muted-foreground">Columns: performance (low → high) · Rows: potential (high → low)</p>

      <form
        onSubmit={(e) => { e.preventDefault(); run(() => setNineBox({ profileId, performance: Number(perf), potential: Number(pot), period: "Q2 2026" })); }}
        className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4"
      >
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-sm">
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <label className="text-xs text-muted-foreground">Performance
          <select value={perf} onChange={(e) => setPerf(e.target.value)} className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Potential
          <select value={pot} onChange={(e) => setPot(e.target.value)} className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
          </select>
        </label>
        <Button size="sm" type="submit" disabled={pending}>Place</Button>
      </form>
    </section>
  );
}
