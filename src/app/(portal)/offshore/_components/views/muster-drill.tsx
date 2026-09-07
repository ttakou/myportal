"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, ClipboardCheck, FileText, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EMERGENCY_TEAM_LABEL, type EmergencyTeamMember, type MusterDrill } from "@/types/offshore";
import {
  describeCloseOut,
  mmss,
  MUSTER_OUTCOME_LABEL,
  musterHeadline,
  musterSummary,
  type MusterOutcome,
} from "@/lib/offshore/muster-closeout";
import type { MusterDrillSummary } from "@/lib/offshore/muster";
import {
  startMusterDrill,
  setMusterCheckin,
  setMusterOutcome,
  closeOutMusterDrill,
  voidMusterDrill,
} from "../../actions";
import { EMERGENCY_TEAMS, useRun } from "./shared";

export type { MusterDrillSummary } from "@/lib/offshore/muster";

/**
 * Muster drill: run a roll-call, close it out, and read past ones.
 *
 * A roll-call is not finished when the clock stops. Closing out means every
 * person has an outcome — accounted, no-show, or never on board — and the
 * report is final. A test run or an abandoned drill is voided instead, kept
 * for the record and counted nowhere.
 */

const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC";

/** Past roll-calls (archive) with links to each report, and the close-out debt. */
function MusterArchive({ history }: { history: MusterDrillSummary[] }) {
  const { pending, error, run } = useRun();
  const past = history.filter((d) => d.ended_at);
  if (past.length === 0) return null;
  const debt = past.filter((d) => !d.closed_out_at && !d.voided);
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        Past roll-calls
        {debt.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            {debt.length} not closed out
          </span>
        )}
      </div>
      {error && <p className="px-3 py-2 text-sm text-destructive">{error}</p>}
      <ul className="divide-y text-sm">
        {past.map((d) => {
          const finished = Boolean(d.closed_out_at) || d.voided;
          const open = d.total - d.accounted - d.no_show - d.not_on_board;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
              <span className={cn("font-medium", d.voided && "line-through opacity-60")}>{fmt(d.started_at)}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  d.kind === "real" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                )}
              >
                {d.kind === "real" ? "Emergency" : "Drill"}
              </span>
              {d.voided ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Void</span>
              ) : (
                <span className="text-xs">
                  <span className="text-green-700">{d.accounted} accounted</span>
                  {d.no_show > 0 && <span className="text-destructive"> · {d.no_show} no-show</span>}
                  {d.not_on_board > 0 && <span className="text-muted-foreground"> · {d.not_on_board} not on board</span>}
                  {open > 0 && <span className="text-amber-700"> · {open} open</span>}
                  <span className="text-muted-foreground"> · {d.total} POB</span>
                </span>
              )}
              {!finished && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  Not closed out
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                {!finished && (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      title="Everyone still open is recorded as a no-show and the report becomes final"
                      onClick={() => {
                        if (confirm(`Close out the roll-call of ${fmt(d.started_at)}: ${open} still open recorded as no-show?`))
                          run(() => closeOutMusterDrill(d.id, { remaining: "no_show" }));
                      }}
                      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" /> Close out
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      title="A test run or an abandoned roll-call: kept for the record, counted nowhere"
                      onClick={() => {
                        if (confirm(`Void the roll-call of ${fmt(d.started_at)}? It stays in the archive marked void.`))
                          run(() => voidMusterDrill(d.id, "Voided from the archive"));
                      }}
                      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                    >
                      <Ban className="h-3.5 w-3.5" /> Void
                    </button>
                  </>
                )}
                <a
                  href={`/offshore-muster/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                >
                  <FileText className="h-3.5 w-3.5" /> Report
                </a>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Live emergency muster roll-call: tick off who's accounted per muster group, then close out. */
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
  const [closing, setClosing] = useState(false);

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
          When it is over, close it out: every person gets an outcome and the report becomes final.
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

  const summary = musterSummary(drill.checkins, drill.started_at);
  const groups = new Map<string, typeof drill.checkins>();
  for (const c of drill.checkins) {
    const g = c.lifeboat || "Unassigned";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }

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
          <span className="font-semibold text-green-700">{summary.accounted}</span> accounted ·{" "}
          <span className={cn("font-semibold", summary.open > 0 ? "text-destructive" : "text-muted-foreground")}>
            {summary.open}
          </span>{" "}
          open
          {summary.noShow > 0 && <> · <span className="font-semibold text-destructive">{summary.noShow}</span> no-show</>}
          {summary.notOnBoard > 0 && <> · {summary.notOnBoard} not on board</>}
          {" "}· {summary.total} POB
          {summary.allClearAt && summary.secondsToAllClear != null && (
            <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
              All clear in {mmss(summary.secondsToAllClear)}
            </span>
          )}
        </span>
        <a
          href={`/offshore-muster/${drill.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <FileText className="h-3.5 w-3.5" /> Report
        </a>
        <Button size="sm" disabled={pending} onClick={() => setClosing((v) => !v)}>
          <ClipboardCheck className="h-4 w-4" /> Close out
        </Button>
      </div>

      {closing && (
        <CloseOut
          drill={drill}
          pending={pending}
          onOutcome={(id, outcome) => run(() => setMusterOutcome(id, outcome))}
          onClose={(remaining, note) => run(() => closeOutMusterDrill(drill.id, { remaining, note }), () => setClosing(false))}
          onVoid={(note) => run(() => voidMusterDrill(drill.id, note), () => setClosing(false))}
          onCancel={() => setClosing(false)}
        />
      )}

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
                          p.outcome === "no_show" && "bg-destructive/5 text-destructive",
                          p.outcome === "not_on_board" && "text-muted-foreground",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={p.accounted}
                          disabled={pending}
                          onChange={(e) => run(() => setMusterCheckin(p.id, e.target.checked))}
                        />
                        <span className={cn(p.accounted && "line-through opacity-70")}>{p.name}</span>
                        {p.outcome && p.outcome !== "accounted" && (
                          <span className="ml-auto text-[11px] font-medium">{MUSTER_OUTCOME_LABEL[p.outcome]}</span>
                        )}
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

/**
 * The close-out: every person still open gets an outcome, one by one or all
 * at once, then a note and a confirmation. Nothing is final until confirmed.
 */
function CloseOut({
  drill,
  pending,
  onOutcome,
  onClose,
  onVoid,
  onCancel,
}: {
  drill: MusterDrill;
  pending: boolean;
  onOutcome: (checkinId: string, outcome: MusterOutcome | null) => void;
  onClose: (remaining: Exclude<MusterOutcome, "accounted">, note: string) => void;
  onVoid: (note: string) => void;
  onCancel: () => void;
}) {
  const [remaining, setRemaining] = useState<Exclude<MusterOutcome, "accounted">>("no_show");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"close" | "void" | null>(null);
  const summary = musterSummary(drill.checkins, drill.started_at);
  const open = drill.checkins.filter((c) => !c.outcome);
  const text = describeCloseOut(summary, remaining);

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Close out — {musterHeadline(summary)}</p>

      {open.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-white/70 p-2">
          <p className="mb-1 text-xs">
            {open.length} still open. Say what became of each, or leave them to the default below.
          </p>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {open.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded px-2 py-1 hover:bg-amber-50">
                <span className="min-w-0 flex-1 truncate">
                  {c.name}
                  <span className="ml-1 text-xs text-muted-foreground">{c.lifeboat ?? "Unassigned"}</span>
                </span>
                {(["accounted", "no_show", "not_on_board"] as MusterOutcome[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={pending}
                    onClick={() => onOutcome(c.id, o)}
                    className="rounded border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                  >
                    {MUSTER_OUTCOME_LABEL[o]}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            Everyone still open at close-out is
            <select
              value={remaining}
              onChange={(e) => setRemaining(e.target.value as Exclude<MusterOutcome, "accounted">)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="no_show">a no-show (failed to muster)</option>
              <option value="not_on_board">not on board (the POB snapshot was wrong)</option>
            </select>
          </label>
        </div>
      ) : (
        <p className="text-xs">Everyone has an outcome.</p>
      )}

      <label className="block text-xs font-medium">
        Note for the report (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What happened, what to fix before the next one."
          className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>

      {confirming === "close" && (
        <div role="alertdialog" className="rounded-md border border-amber-300 bg-white px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{text.title}</p>
              <p className="mt-0.5 text-xs">{text.consequence}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={pending} onClick={() => onClose(remaining, note)}>
                  {pending ? "Saving…" : text.confirmLabel}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <span className="text-xs">Nothing changes until you confirm.</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirming === "void" && (
        <div role="alertdialog" className="rounded-md border border-amber-300 bg-white px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Void this roll-call?</p>
              <p className="mt-0.5 text-xs">
                For a test run or an abandoned drill. It stays in the archive marked void and counts in
                no report. The people on it get no outcome.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="destructive" disabled={pending} onClick={() => onVoid(note)}>
                  {pending ? "Saving…" : "Void roll-call"}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!confirming && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={pending} onClick={() => setConfirming("close")}>
            <ClipboardCheck className="h-4 w-4" /> Close out roll-call
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirming("void")}>
            <Ban className="h-4 w-4" /> Void (test run)
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
            Back to the roll-call
          </Button>
        </div>
      )}
    </div>
  );
}
