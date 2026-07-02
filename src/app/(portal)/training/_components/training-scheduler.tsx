"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatusTransition } from "@/components/activity";
import type { TrainingPlan } from "@/lib/training-planner";
import { generateTrainingSchedule, commitTrainingSchedule } from "../actions";

type Emp = { id: string; name: string; department?: string | null; offshore?: boolean };
type Course = { id: string; title: string };

function fmt(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function TrainingScheduler({ courses, employees }: { courses: Course[]; employees: Emp[] }) {
  const [courseId, setCourseId] = useState("");
  const [start, setStart] = useState("");
  const [days, setDays] = useState("1");
  const [capacity, setCapacity] = useState("12");
  const [gap, setGap] = useState("0");

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [loc, setLoc] = useState<"" | "offshore" | "onshore">("");

  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [genPending, startGen] = useStatusTransition("Generating…");
  const [commitPending, startCommit] = useStatusTransition("Saving…");

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter((d): d is string => Boolean(d)))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (dept && (e.department ?? "") !== dept) return false;
      if (loc === "offshore" && !e.offshore) return false;
      if (loc === "onshore" && e.offshore) return false;
      return true;
    });
  }, [employees, search, dept, loc]);

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectFiltered() {
    setPicked((s) => new Set([...s, ...filtered.map((e) => e.id)]));
  }

  function generate() {
    setError(null);
    setOkMsg(null);
    startGen(async () => {
      const res = await generateTrainingSchedule({
        courseId,
        profileIds: [...picked],
        startDate: start,
        sessionDays: Number(days) || 1,
        capacity: Number(capacity) || 1,
        gapDays: Number(gap) || 0,
      });
      if (!res.ok) setError(res.error);
      else setPlan(res.plan);
    });
  }

  function removeMember(sessionIndex: number, profileId: string) {
    setPlan((p) => {
      if (!p) return p;
      return {
        ...p,
        sessions: p.sessions.map((s) =>
          s.index === sessionIndex ? { ...s, members: s.members.filter((m) => m.profileId !== profileId) } : s,
        ),
      };
    });
  }

  const totalScheduled = plan?.sessions.reduce((n, s) => n + s.members.length, 0) ?? 0;
  const canCommit = Boolean(plan) && totalScheduled > 0 && !commitPending;

  function commit() {
    if (!plan) return;
    setError(null);
    setOkMsg(null);
    startCommit(async () => {
      const res = await commitTrainingSchedule({
        courseId,
        sessions: plan.sessions
          .filter((s) => s.members.length > 0)
          .map((s) => ({ startDate: s.startDate, endDate: s.endDate, memberIds: s.members.map((m) => m.profileId) })),
      });
      if (!res.ok) setError(res.error ?? "Could not save.");
      else {
        setOkMsg(`Created ${plan.sessions.length} session(s) for ${totalScheduled} participant(s).`);
        setPlan(null);
        setPicked(new Set());
      }
    });
  }

  const field = "rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Training scheduler</h2>
      </div>

      {/* Parameters */}
      <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-5">
        <label className="text-sm sm:col-span-2">
          <span className="text-muted-foreground">Course</span>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={cn(field, "mt-1 block w-full")}>
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Start date</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Duration (days)</span>
          <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Capacity / session</span>
          <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Gap between sessions (days)</span>
          <input type="number" min={0} value={gap} onChange={(e) => setGap(e.target.value)} className={cn(field, "mt-1 block w-full")} />
        </label>
      </div>

      {/* Pool selection */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Pool</span>
          <span className="text-xs text-muted-foreground">{picked.size} selected · {filtered.length} shown</span>
          {/* Filters */}
          <select value={loc} onChange={(e) => setLoc(e.target.value as "" | "offshore" | "onshore")} className={cn(field, "ml-auto")}>
            <option value="">All locations</option>
            <option value="offshore">Offshore staff</option>
            <option value="onshore">Onshore staff</option>
          </select>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={field}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className={cn(field, "pl-7")} />
          </span>
          <button type="button" onClick={selectFiltered} className="rounded-md border px-2 py-1.5 text-xs hover:bg-accent">
            Select shown
          </button>
          {(dept || loc || search) && (
            <button type="button" onClick={() => { setDept(""); setLoc(""); setSearch(""); }} className="rounded-md border px-2 py-1.5 text-xs hover:bg-accent">
              Reset filters
            </button>
          )}
          {picked.size > 0 && (
            <button type="button" onClick={() => setPicked(new Set())} className="rounded-md border px-2 py-1.5 text-xs hover:bg-accent">
              Clear
            </button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto rounded-md border">
          {filtered.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0 hover:bg-accent/40">
              <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {e.offshore && <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-700">offshore</span>}
              {e.department && <span className="hidden text-xs text-muted-foreground sm:inline">{e.department}</span>}
            </label>
          ))}
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={generate}
          disabled={genPending || !courseId || !start || picked.size === 0}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {genPending ? "Generating…" : "Generate schedule"}
        </button>
        <span className="ml-3 text-xs text-muted-foreground">
          Offshore staff are booked only when onshore; planned training &amp; medical visits are avoided.
        </span>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {okMsg && <p className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-800">{okMsg}</p>}

      {plan && (
        <>
          <p className="text-sm text-muted-foreground">
            {plan.sessions.length} session(s) · {totalScheduled} scheduled
            {plan.unscheduled.length > 0 && (
              <span className="ml-2 font-medium text-amber-600">· {plan.unscheduled.length} unscheduled</span>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.sessions.map((s) => (
              <div key={s.index} className="rounded-lg border bg-card p-3">
                <p className="text-sm font-semibold">
                  Session {s.index + 1}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {fmt(s.startDate)}{s.endDate !== s.startDate ? ` – ${fmt(s.endDate)}` : ""}
                  </span>
                </p>
                <p className="mb-1 text-xs text-muted-foreground">{s.members.length} participant(s)</p>
                <ul className="space-y-0.5">
                  {s.members.map((m) => (
                    <li key={m.profileId} className="flex items-center justify-between gap-2 text-sm">
                      <span>{m.name}</span>
                      <button type="button" onClick={() => removeMember(s.index, m.profileId)} className="text-muted-foreground hover:text-destructive" title="Remove">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {plan.unscheduled.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">Could not schedule ({plan.unscheduled.length})</p>
              <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
                {plan.unscheduled.map((u) => (
                  <li key={u.profileId}>{u.name} — {u.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" onClick={commit} disabled={!canCommit}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            <Check className="h-4 w-4" /> {commitPending ? "Saving…" : `Create ${plan.sessions.length} session(s)`}
          </button>
        </>
      )}
    </section>
  );
}
