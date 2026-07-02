"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Plus, X, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatusTransition } from "@/components/activity";
import { isAvailable, type PlanCandidate } from "@/lib/medical-planner";
import {
  generateMedicalCampaign,
  lookupCampaignCandidate,
  commitMedicalCampaign,
} from "../actions";

type Row = {
  profileId: string;
  name: string;
  visit1: string;
  visit2: string;
  status: "ok" | "unscheduled";
  reason?: string;
};

function issuesFor(cand: PlanCandidate | undefined, row: Row): string[] {
  if (!cand) return [];
  const out: string[] = [];
  if (row.visit1) {
    const a = isAvailable(cand, row.visit1);
    if (!a.ok) out.push(`1st visit: ${a.reason}`);
  }
  if (row.visit2) {
    const a = isAvailable(cand, row.visit2);
    if (!a.ok) out.push(`2nd visit: ${a.reason}`);
  }
  return out;
}

export function CampaignPlanner({
  addableStaff,
}: {
  addableStaff: { id: string; name: string }[];
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [gap, setGap] = useState("3");

  const [rows, setRows] = useState<Row[]>([]);
  const [cands, setCands] = useState<Map<string, PlanCandidate>>(new Map());
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [addPick, setAddPick] = useState("");

  const [genPending, startGen] = useStatusTransition("Generating…");
  const [commitPending, startCommit] = useStatusTransition("Saving…");

  function generate() {
    setError(null);
    setOkMsg(null);
    startGen(async () => {
      const res = await generateMedicalCampaign({
        startDate: start,
        endDate: end,
        capacityPerDay: Number(capacity) || 0,
        visitGapDays: Number(gap) || 3,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCands(new Map(res.candidates.map((c) => [c.profileId, c])));
      setRows(
        res.rows.map((r) => ({
          profileId: r.profileId,
          name: r.name,
          visit1: r.visit1 ?? "",
          visit2: r.visit2 ?? "",
          status: r.status,
          reason: r.reason,
        })),
      );
      setGenerated(true);
    });
  }

  function setDate(profileId: string, field: "visit1" | "visit2", value: string) {
    setRows((rs) => rs.map((r) => (r.profileId === profileId ? { ...r, [field]: value } : r)));
  }
  function removeRow(profileId: string) {
    setRows((rs) => rs.filter((r) => r.profileId !== profileId));
  }
  function addStaff() {
    if (!addPick) return;
    if (rows.some((r) => r.profileId === addPick)) return;
    const picked = addableStaff.find((s) => s.id === addPick);
    const id = addPick;
    setAddPick("");
    startGen(async () => {
      const res = await lookupCampaignCandidate(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCands((m) => new Map(m).set(id, res.candidate));
      setRows((rs) => [
        ...rs,
        { profileId: id, name: picked?.name ?? res.candidate.name, visit1: "", visit2: "", status: "unscheduled" },
      ]);
    });
  }

  const addable = useMemo(
    () => addableStaff.filter((s) => !rows.some((r) => r.profileId === s.id)),
    [addableStaff, rows],
  );

  const scheduled = rows.filter((r) => r.visit1);
  const blocking = rows.filter((r) => issuesFor(cands.get(r.profileId), r).length > 0);
  const canCommit = generated && scheduled.length > 0 && blocking.length === 0 && !commitPending;

  function commit() {
    setError(null);
    setOkMsg(null);
    startCommit(async () => {
      const year = Number((start || scheduled[0]?.visit1 || "").slice(0, 4)) || new Date().getUTCFullYear();
      const res = await commitMedicalCampaign({
        year,
        rows: scheduled.map((r) => {
          const cand = cands.get(r.profileId);
          return {
            profileId: r.profileId,
            visit1: r.visit1,
            visit2: r.visit2 || null,
            workLocation: cand?.crew ? "Offshore" : "Onshore",
          };
        }),
      });
      if (!res.ok) setError(res.error ?? "Could not save.");
      else setOkMsg(`Scheduled ${scheduled.length} employee${scheduled.length === 1 ? "" : "s"}.`);
    });
  }

  const field = "rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Plan annual medical campaign</h2>
      </div>

      {/* Parameters */}
      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
        <label className="text-sm">
          <span className="text-muted-foreground">Start date</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">End date</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Capacity / day</span>
          <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Gap 1st→2nd (days)</span>
          <input type="number" min={1} value={gap} onChange={(e) => setGap(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
        <div className="sm:col-span-4">
          <button
            type="button"
            onClick={generate}
            disabled={genPending || !start || !end}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {genPending ? "Generating…" : generated ? "Regenerate proposal" : "Generate proposal"}
          </button>
          <span className="ml-3 text-xs text-muted-foreground">
            Clinic days are Tue &amp; Thu (first is a Tuesday); offshore rotation &amp; planned training are honoured.
          </span>
        </div>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {okMsg && <p className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-800">{okMsg}</p>}

      {generated && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {scheduled.length} scheduled · {rows.length - scheduled.length} unscheduled
              {blocking.length > 0 && (
                <span className="ml-2 font-medium text-destructive">· {blocking.length} conflict(s) to resolve</span>
              )}
            </span>
            {/* Add staff */}
            <span className="ml-auto flex items-center gap-2">
              <select value={addPick} onChange={(e) => setAddPick(e.target.value)} className={field}>
                <option value="">Add staff…</option>
                {addable.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button type="button" onClick={addStaff} disabled={!addPick || genPending}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
                <Plus className="h-4 w-4" /> Add
              </button>
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">1st visit</th>
                  <th className="px-3 py-2">2nd visit</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const issues = issuesFor(cands.get(r.profileId), r);
                  return (
                    <tr key={r.profileId} className={cn("border-t", issues.length > 0 && "bg-destructive/5")}>
                      <td className="px-3 py-2 font-medium">
                        {r.name}
                        {cands.get(r.profileId)?.crew && (
                          <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-700">offshore</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input type="date" value={r.visit1} onChange={(e) => setDate(r.profileId, "visit1", e.target.value)} className={field} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="date" value={r.visit2} onChange={(e) => setDate(r.profileId, "visit2", e.target.value)} className={field} />
                      </td>
                      <td className="px-3 py-2">
                        {issues.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" /> {issues.join("; ")}
                          </span>
                        ) : r.visit1 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <Check className="h-3.5 w-3.5" /> OK
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600">{r.reason ?? "No date"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => removeRow(r.profileId)} title="Remove" className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={commit} disabled={!canCommit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {commitPending ? "Saving…" : `Commit ${scheduled.length} schedule(s)`}
            </button>
            {blocking.length > 0 && (
              <span className="text-xs text-destructive">Resolve the {blocking.length} conflict(s) before committing.</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
