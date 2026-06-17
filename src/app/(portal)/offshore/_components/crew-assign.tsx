"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { ArrowLeftRight, CalendarCog, GitMerge, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AssignableEmployee, Crew } from "@/types/offshore";
import {
  assignToCrew,
  autoAssignBySchedule,
  mergeCrews,
  registerOffshoreEmployee,
} from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function CrewAssign({
  employees,
  crews,
}: {
  employees: AssignableEmployee[];
  crews: Crew[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <CrewBuilder employees={employees} crews={crews} pending={pending} run={run} />
      <ScheduleAssign employees={employees} pending={pending} run={run} />
      <MergeCrews crews={crews} pending={pending} run={run} />
    </div>
  );
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

// --- UI 1: select a crew, drag members in/out --------------------------------
function CrewBuilder({
  employees,
  crews,
  pending,
  run,
}: {
  employees: AssignableEmployee[];
  crews: Crew[];
  pending: boolean;
  run: Runner;
}) {
  const [crewId, setCrewId] = useState(crews[0]?.id ?? "");
  const [q, setQ] = useState("");

  const members = useMemo(() => employees.filter((e) => e.crew_id === crewId), [employees, crewId]);
  const available = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return employees.filter(
      (e) => e.crew_id !== crewId && (!ql || e.name.toLowerCase().includes(ql)),
    );
  }, [employees, crewId, q]);

  function onDrop(toCrew: string | null, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) run(() => assignToCrew([id], toCrew));
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Build a crew</h3>
        <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className={`${field} ml-2`}>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag people between the columns (or use the arrows). A room isn&apos;t required to join a crew.
      </p>

      <NewEmployee crewId={crewId} crewName={crews.find((c) => c.id === crewId)?.name} />

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Available */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDrop(null, e)}
          className="rounded-lg border bg-card p-2"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">All employees</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-32 rounded-md border bg-background px-2 py-1 text-xs" />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {available.map((e) => (
              <div
                key={e.id}
                draggable={!pending}
                onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
                className="flex items-center justify-between rounded-md border px-2 py-1 text-sm hover:bg-accent"
              >
                <span className="truncate">
                  {e.name}
                  {e.crew_name && <span className="ml-1 text-[10px] text-muted-foreground">{e.crew_name}</span>}
                </span>
                <button
                  disabled={pending}
                  title="Add to crew"
                  onClick={() => run(() => assignToCrew([e.id], crewId))}
                  className="text-muted-foreground hover:text-primary"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {available.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matches.</p>}
          </div>
        </div>

        {/* Members */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDrop(crewId, e)}
          className="rounded-lg border border-primary/30 bg-primary/5 p-2"
        >
          <div className="mb-2 text-sm font-medium">
            {crews.find((c) => c.id === crewId)?.name ?? "Crew"} · {members.length}
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {members.map((e) => (
              <div
                key={e.id}
                draggable={!pending}
                onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
                className="flex items-center justify-between rounded-md border bg-card px-2 py-1 text-sm"
              >
                <span className="truncate">{e.name}</span>
                <button
                  disabled={pending}
                  title="Remove from crew"
                  onClick={() => run(() => assignToCrew([e.id], null))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            ))}
            {members.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                Drop employees here to add them to this crew.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// --- Register a brand-new employee, optionally straight into the crew --------
function NewEmployee({ crewId, crewName }: { crewId: string; crewName?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [toCrew, setToCrew] = useState(true);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTemp(null);
    startTransition(async () => {
      const res = await registerOffshoreEmployee({
        fullName: name,
        email: email || undefined,
        company: company || undefined,
        crewId: toCrew ? crewId : undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not register.");
        return;
      }
      setTemp(res.tempPassword ?? "set");
      setName("");
      setEmail("");
      setCompany("");
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Register new employee
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-card/50 p-3">
      <UserPlus className="h-4 w-4 text-muted-foreground" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className={field} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional)" className={field} />
      <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className={`${field} w-40`} />
      <label className="inline-flex items-center gap-1 text-sm">
        <input type="checkbox" checked={toCrew} onChange={(e) => setToCrew(e.target.checked)} />
        add to {crewName ?? "crew"}
      </label>
      <Button size="sm" type="submit" disabled={pending || !name.trim()}>
        {pending ? "Creating…" : "Register"}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Close</Button>
      {error && <span className="w-full text-xs text-destructive">{error}</span>}
      {temp && (
        <span className="w-full text-xs text-green-600">
          Registered{temp !== "set" ? ` · temporary password: ${temp}` : ""}.
        </span>
      )}
    </form>
  );
}

// --- UI 2: define a rotation calendar, auto-assign to the matching crew -------
function ScheduleAssign({
  employees,
  pending,
  run,
}: {
  employees: AssignableEmployee[];
  pending: boolean;
  run: Runner;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [off, setOff] = useState("14");
  const [on, setOn] = useState("14");
  const [start, setStart] = useState("");
  const [proposeName, setProposeName] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [pend, startT] = useStatusTransition("Saving…");

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return employees.filter((e) => !ql || e.name.toLowerCase().includes(ql)).slice(0, 200);
  }, [employees, q]);

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function submit(createName?: string) {
    setInfo(null);
    setProposeName(null);
    startT(async () => {
      const res = await autoAssignBySchedule({
        profileIds: [...picked],
        offshoreDays: Number(off),
        onshoreDays: Number(on),
        cycleStartDate: start,
        newCrewName: createName,
      });
      if (!res.ok) {
        setInfo(res.error ?? "Failed.");
        return;
      }
      if (res.matched === false) {
        setProposeName(`${off}/${on} from ${start}`);
        return;
      }
      setInfo(`Assigned ${picked.size} to ${res.crewName}.`);
      setPicked(new Set());
      setNewName("");
    });
  }

  const busy = pending || pend;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <CalendarCog className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Assign by rotation calendar</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Pick employees and their schedule. The system puts everyone with the same recurrent calendar
        in the same crew — and proposes a new crew if none matches.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border p-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees…" className="mb-2 w-full rounded-md border bg-background px-2 py-1 text-xs" />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {list.map((e) => (
              <label key={e.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
                <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                <span className="truncate">{e.name}</span>
                {e.crew_name && <span className="text-[10px] text-muted-foreground">{e.crew_name}</span>}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{picked.size} selected</p>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted-foreground">Offshore days
              <input value={off} onChange={(e) => setOff(e.target.value)} type="number" min={1} className={`mt-1 w-full ${field}`} /></label>
            <label className="text-xs text-muted-foreground">Onshore days
              <input value={on} onChange={(e) => setOn(e.target.value)} type="number" min={1} className={`mt-1 w-full ${field}`} /></label>
            <label className="text-xs text-muted-foreground">Cycle start
              <input value={start} onChange={(e) => setStart(e.target.value)} type="date" className={`mt-1 w-full ${field}`} /></label>
          </div>
          <Button size="sm" disabled={busy || picked.size === 0 || !start} onClick={() => submit()}>
            Auto-assign
          </Button>

          {proposeName && (
            <div className="rounded-md bg-amber-50 p-3 text-sm">
              <p className="text-amber-800">No crew uses the {proposeName} calendar. Create one?</p>
              <div className="mt-2 flex gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New crew name" className={field} />
                <Button size="sm" disabled={busy || !newName.trim()} onClick={() => submit(newName.trim())}>
                  Create &amp; assign
                </Button>
              </div>
            </div>
          )}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
        </div>
      </div>
    </section>
  );
}

// --- Merge crews that share a calendar ---------------------------------------
function MergeCrews({ crews, pending, run }: { crews: Crew[]; pending: boolean; run: Runner }) {
  const groups = useMemo(() => {
    const m = new Map<string, Crew[]>();
    for (const c of crews) {
      if (!c.cycle_start_date) continue;
      const sig = `${c.offshore_days}/${c.onshore_days}@${c.cycle_start_date}`;
      m.set(sig, [...(m.get(sig) ?? []), c]);
    }
    return [...m.entries()].filter(([, list]) => list.length > 1);
  }, [crews]);

  if (groups.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <GitMerge className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Crews sharing a calendar</h3>
      </div>
      {groups.map(([sig, list]) => (
        <MergeRow key={sig} sig={sig} list={list} pending={pending} run={run} />
      ))}
    </section>
  );
}

function MergeRow({
  sig,
  list,
  pending,
  run,
}: {
  sig: string;
  list: Crew[];
  pending: boolean;
  run: Runner;
}) {
  const [target, setTarget] = useState(list[0].id);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="text-xs text-muted-foreground">{sig}:</span>
      <span>{list.map((c) => c.name).join(", ")}</span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">keep</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-md border bg-background px-1.5 py-1 text-xs">
          {list.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm(`Merge ${list.length} crews into ${list.find((c) => c.id === target)?.name}?`))
              run(() => mergeCrews(target, list.filter((c) => c.id !== target).map((c) => c.id)));
          }}
        >
          Merge
        </Button>
      </span>
    </div>
  );
}
