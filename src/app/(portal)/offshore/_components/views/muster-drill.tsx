"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EMERGENCY_TEAM_LABEL, type EmergencyTeamMember, type MusterDrill } from "@/types/offshore";
import { startMusterDrill, setMusterCheckin, endMusterDrill } from "../../actions";
import { EMERGENCY_TEAMS, useRun } from "./shared";

/**
 * Muster drill: run a roll-call, close it out, and read past ones.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

export type MusterDrillSummary = {
  id: string;
  started_at: string;
  ended_at: string | null;
  kind: string;
  total: number;
  accounted: number;
};

/** Past roll-calls (archive) with links to each report. */
function MusterArchive({ history }: { history: MusterDrillSummary[] }) {
  const past = history.filter((d) => d.ended_at);
  if (past.length === 0) return null;
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">Past roll-calls</div>
      <ul className="divide-y text-sm">
        {past.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
            <span className="font-medium">
              {new Date(d.started_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                d.kind === "real" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {d.kind === "real" ? "Emergency" : "Drill"}
            </span>
            <span className={cn("text-xs", d.accounted < d.total ? "text-destructive" : "text-green-700")}>
              {d.accounted}/{d.total} accounted
            </span>
            <a
              href={`/offshore-muster/${d.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
            >
              <FileText className="h-3.5 w-3.5" /> Report
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Live emergency muster roll-call: tick off who's accounted per muster group. */
export function MusterDrillPanel({
  drill,
  history,
  emergencyTeams,
}: {
  drill: MusterDrill | null;
  history: MusterDrillSummary[];
  emergencyTeams: EmergencyTeamMember[];
}) {
  const { pending, error, run } = useRun();
  const [elapsed, setElapsed] = useState("00:00");

  // HLO / fire-team members among this roll-call's POB snapshot, with their live
  // accounted state — during an emergency the OIM needs to see at a glance
  // whether the response teams themselves are mustered.
  const teamStatus = useMemo(() => {
    if (!drill) return [];
    const today = new Date().toISOString().slice(0, 10);
    const windows = [...new Map(
      emergencyTeams.map((m) => [`${m.from_date}|${m.to_date}`, { from: m.from_date, to: m.to_date }]),
    ).values()].sort((a, b) => b.from.localeCompare(a.from));
    const active = windows.find((w) => w.from <= today && w.to >= today) ?? windows[0] ?? null;
    if (!active) return [];
    const byProfile = new Map(
      drill.checkins.filter((c) => c.profile_id).map((c) => [c.profile_id as string, c]),
    );
    return EMERGENCY_TEAMS.map((team) => {
      const members = emergencyTeams.filter(
        (m) => m.team === team && m.from_date === active.from && m.to_date === active.to,
      );
      const onboard = members
        .flatMap((m) => {
          const c = byProfile.get(m.profile_id);
          return c ? [{ name: m.person_name ?? c.name, accounted: c.accounted, checkinId: c.id }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return { team, onboard, ashore: members.length - onboard.length };
    }).filter((t) => t.onboard.length > 0 || t.ashore > 0);
  }, [drill, emergencyTeams]);

  useEffect(() => {
    if (!drill) return;
    const start = new Date(drill.started_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [drill]);

  if (!drill) {
    return (
      <div className="space-y-3">
        {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
        <p className="text-sm text-muted-foreground">
          Start a roll-call to snapshot everyone on board and check them off at their muster station.
        </p>
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => run(() => startMusterDrill("drill"))}>
            <Siren className="h-4 w-4" /> Start drill roll-call
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (confirm("Start a REAL emergency roll-call?")) run(() => startMusterDrill("real"));
            }}
          >
            Real emergency
          </Button>
        </div>
        <MusterArchive history={history} />
      </div>
    );
  }

  const groups = new Map<string, typeof drill.checkins>();
  for (const c of drill.checkins) {
    const g = c.lifeboat || "Unassigned";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const total = drill.checkins.length;
  const accounted = drill.checkins.filter((c) => c.accounted).length;
  const unaccounted = total - accounted;

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border p-3",
          drill.kind === "real" ? "border-destructive bg-destructive/5" : "bg-card",
        )}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Siren className={cn("h-4 w-4", drill.kind === "real" && "text-destructive")} />
          {drill.kind === "real" ? "EMERGENCY roll-call" : "Drill roll-call"}
        </span>
        <span className="font-mono text-lg tabular-nums">{elapsed}</span>
        <span className="text-sm">
          <span className="font-semibold text-green-700">{accounted}</span> accounted ·{" "}
          <span className={cn("font-semibold", unaccounted > 0 ? "text-destructive" : "text-muted-foreground")}>
            {unaccounted}
          </span>{" "}
          unaccounted · {total} POB
        </span>
        <a
          href={`/offshore-muster/${drill.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </a>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm("End this roll-call?")) run(() => endMusterDrill(drill.id));
          }}
        >
          End roll-call
        </Button>
      </div>

      {/* Emergency response teams on board — checked off from the same roll-call. */}
      {teamStatus.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {teamStatus.map(({ team, onboard, ashore }) => {
            const acc = onboard.filter((m) => m.accounted).length;
            return (
              <div
                key={team}
                className={cn(
                  "rounded-lg border p-3",
                  team === "fire_team" ? "border-red-200 bg-red-50/50" : "border-sky-200 bg-sky-50/50",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                      team === "fire_team" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800",
                    )}
                  >
                    <Siren className="h-3 w-3" />
                    {EMERGENCY_TEAM_LABEL[team]} on board
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {acc}/{onboard.length} accounted{ashore > 0 ? ` · ${ashore} ashore` : ""}
                  </span>
                </div>
                {onboard.length === 0 ? (
                  <p className="text-sm font-medium text-destructive">
                    Nobody from this team is on board.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {onboard.map((m) => (
                      <li key={m.checkinId}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => setMusterCheckin(m.checkinId, !m.accounted))}
                          title={m.accounted ? "Accounted — click to undo" : "Unaccounted — click to check off"}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-medium",
                            m.accounted
                              ? "border-green-200 bg-green-100 text-green-900 line-through"
                              : "bg-background hover:bg-accent",
                          )}
                        >
                          {m.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {[...groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([g, people]) => {
            const acc = people.filter((p) => p.accounted).length;
            return (
              <div key={g} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{g}</span>
                  <span className="text-xs text-muted-foreground">
                    {acc}/{people.length} accounted
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {people.map((p) => (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm",
                          p.accounted ? "bg-green-50 text-green-900" : "hover:bg-accent",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={p.accounted}
                          disabled={pending}
                          onChange={(e) => run(() => setMusterCheckin(p.id, e.target.checked))}
                        />
                        <span className={cn(p.accounted && "line-through opacity-70")}>{p.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
      </div>

      <MusterArchive history={history} />
    </div>
  );
}
