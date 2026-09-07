"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStatusTransition } from "@/components/activity";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/types/offshore";
import {
  EMERGENCY_ROLE_LABEL,
  EMERGENCY_TEAM_LABEL,
  type EmergencyRole,
  type EmergencyRoleKind,
  type EmergencyTeamKind,
  type EmergencyTeamMember,
  type PobOnboard,
} from "@/types/offshore";
import { addCasualVisitor, setPersonLifeboat } from "../../actions";
import { field, EMERGENCY_ORDER, EMERGENCY_TEAMS } from "./shared";

/**
 * Live board: who is on board right now, by muster station, with the
 * casual-visitor form the radio room uses.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

/** Compact leader labels for the live board chips. */
const LEADER_SHORT: Record<EmergencyRoleKind, string> = {
  evac_leader: "Evac lead",
  evac_assistant: "Evac asst",
  headcount_principal: "HC lead",
  headcount_assistant: "HC asst",
};

/**
 * Live offshore board — who is on board right now, grouped by muster station
 * (lifeboat), each with its assigned room/bed, plus the evacuation & head-count
 * leaders for the current rotation window (flagged by whether the leader is
 * actually on board). Auto-refreshes so it can run on a control-room screen.
 */
export function LiveBoardPanel({
  people,
  emergencyRoles,
  emergencyTeams,
  musterGroups,
  installations,
  readOnly = false,
}: {
  people: PobOnboard[];
  emergencyRoles: EmergencyRole[];
  emergencyTeams: EmergencyTeamMember[];
  musterGroups: string[];
  installations: Installation[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [auto, setAuto] = useState(true);
  const [pending, startTransition] = useStatusTransition("Saving…", "save");
  const [showCasual, setShowCasual] = useState(false);
  // Lifeboat options: configured stations plus any already in use on board.
  const lbOptions = useMemo(() => {
    const set = new Set<string>(musterGroups);
    for (const p of people) if (p.lifeboat) set.add(p.lifeboat);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [musterGroups, people]);

  function saveLifeboat(p: PobOnboard, lifeboat: string) {
    const isVisit = p.trip_id.startsWith("visit-");
    startTransition(async () => {
      await setPersonLifeboat({
        kind: isVisit ? "visit" : "trip",
        id: isVisit ? p.trip_id.slice("visit-".length) : p.trip_id,
        lifeboat: lifeboat || null,
      });
      router.refresh();
    });
  }

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(t);
  }, [auto, router]);

  const today = new Date().toISOString().slice(0, 10);

  // Active rotation window for the emergency org: the one covering today, else
  // the most recent on record (drawn from both leader roles and team rows).
  const windows = useMemo(() => {
    const seen = new Map<string, { from: string; to: string }>();
    for (const r of [...emergencyRoles, ...emergencyTeams]) {
      const k = `${r.from_date}|${r.to_date}`;
      if (!seen.has(k)) seen.set(k, { from: r.from_date, to: r.to_date });
    }
    return [...seen.values()].sort((a, b) => b.from.localeCompare(a.from));
  }, [emergencyRoles, emergencyTeams]);
  const active = useMemo(
    () => windows.find((w) => w.from <= today && w.to >= today) ?? windows[0] ?? null,
    [windows, today],
  );
  const roles = useMemo(
    () =>
      active
        ? emergencyRoles.filter((r) => r.from_date === active.from && r.to_date === active.to)
        : [],
    [active, emergencyRoles],
  );

  const onboardIds = useMemo(
    () => new Set(people.map((p) => p.profile_id).filter(Boolean) as string[]),
    [people],
  );

  // Response teams (HLO, fire) for the active window, split into who is actually
  // on board now vs assigned-but-ashore — the board only lists on-board personnel.
  const teamBuckets = useMemo(() => {
    const map = new Map<EmergencyTeamKind, { onboard: string[]; ashore: number }>();
    for (const team of EMERGENCY_TEAMS) map.set(team, { onboard: [], ashore: 0 });
    if (active) {
      for (const m of emergencyTeams) {
        if (m.from_date !== active.from || m.to_date !== active.to) continue;
        const bucket = map.get(m.team);
        if (!bucket) continue;
        if (onboardIds.has(m.profile_id)) bucket.onboard.push(m.person_name ?? "—");
        else bucket.ashore++;
      }
    }
    for (const b of map.values()) b.onboard.sort((a, c) => a.localeCompare(c));
    return map;
  }, [emergencyTeams, active, onboardIds]);
  const hasTeams = [...teamBuckets.values()].some((b) => b.onboard.length || b.ashore);

  // Group on-board people by muster station (lifeboat); the "—" bucket collects
  // anyone without one — a safety gap worth surfacing prominently.
  const groups = useMemo(() => {
    const m = new Map<string, PobOnboard[]>();
    for (const p of people) {
      const lb = p.lifeboat || "—";
      const list = m.get(lb) ?? [];
      list.push(p);
      m.set(lb, list);
    }
    return [...m.entries()]
      .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)))
      .map(([lb, list]) => ({
        lb,
        people: list.sort((x, y) => x.name.localeCompare(y.name)),
        roles: roles.filter((r) => r.lifeboat === lb),
      }));
  }, [people, roles]);

  const visitorCount = people.filter((p) => p.category === "visitor").length;
  const noBed = people.filter((p) => !p.room_id).length;
  const stationCount = groups.filter((g) => g.lb !== "—").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
        <span className="text-base font-semibold">{people.length} on board</span>
        <span className="text-muted-foreground">· {stationCount} muster station(s)</span>
        {visitorCount > 0 && <span className="text-muted-foreground">· {visitorCount} visitor(s)</span>}
        {noBed > 0 && <span className="font-medium text-destructive">· {noBed} without a bed</span>}
        {active && (
          <span className="text-xs text-muted-foreground">Emergency org: {active.from} → {active.to}</span>
        )}
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Auto-refresh (30s)
        </label>
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          Refresh
        </Button>
        <a
          href="/offshore-pob"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Printer className="h-3.5 w-3.5" /> Print roster
        </a>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowCasual((s) => !s)}>
            {showCasual ? "Close" : "Add casual visitor"}
          </Button>
        )}
      </div>

      {!readOnly && showCasual && (
        <CasualVisitorForm
          lbOptions={lbOptions}
          installations={installations}
          pending={pending}
          onSubmit={(input) =>
            startTransition(async () => {
              const res = await addCasualVisitor(input);
              if (res.ok) {
                setShowCasual(false);
                router.refresh();
              }
            })
          }
        />
      )}

      {hasTeams && (
        <div className="grid gap-3 sm:grid-cols-2">
          {EMERGENCY_TEAMS.map((team) => {
            const b = teamBuckets.get(team)!;
            return (
              <div key={team} className="rounded-lg border bg-card p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    {EMERGENCY_TEAM_LABEL[team]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.onboard.length} on board{b.ashore ? ` · ${b.ashore} ashore` : ""}
                  </span>
                </div>
                {b.onboard.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {b.onboard.map((n, i) => (
                      <span
                        key={`${n}-${i}`}
                        className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] text-green-700"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">None on board.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {people.length === 0 && !showCasual && (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          Nobody is currently on board.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.lb} className="rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className={cn("font-semibold", g.lb === "—" && "text-destructive")}>
                {g.lb === "—" ? "No muster station" : `Muster ${g.lb}`}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{g.people.length} on board</span>
            </div>

            {/* Evacuation & head-count leaders for this station (current window). */}
            {g.lb !== "—" && (
              <div className="flex flex-wrap gap-1.5 border-b bg-muted/30 px-3 py-2">
                {EMERGENCY_ORDER.map((kind) => {
                  const holder = g.roles.find((r) => r.role === kind);
                  const filled = Boolean(holder?.person_name);
                  const onBoard = holder?.profile_id ? onboardIds.has(holder.profile_id) : false;
                  return (
                    <span
                      key={kind}
                      title={EMERGENCY_ROLE_LABEL[kind] + (filled && !onBoard ? " — not on board" : "")}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        !filled && "border-dashed text-muted-foreground",
                        filled && !onBoard && "border-amber-300 bg-amber-50 text-amber-700",
                        onBoard && "border-green-300 bg-green-50 text-green-700",
                      )}
                    >
                      <span className="font-semibold">{LEADER_SHORT[kind]}</span>
                      <span>{holder?.person_name ?? "—"}</span>
                      {filled && (
                        <span
                          className={cn(
                            "ml-0.5 h-1.5 w-1.5 rounded-full",
                            onBoard ? "bg-green-500" : "bg-amber-400",
                          )}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            <ul className="divide-y">
              {g.people.map((p) => {
                const room = p.room_label
                  ? p.bed_no
                    ? `${p.room_label} · ${p.bed_no}`
                    : p.room_label
                  : null;
                const leads = g.roles.filter((r) => r.profile_id && r.profile_id === p.profile_id);
                return (
                  <li key={p.trip_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.category === "visitor" && (
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        visitor
                      </span>
                    )}
                    {leads.map((r) => (
                      <span
                        key={r.id}
                        title={EMERGENCY_ROLE_LABEL[r.role]}
                        className="shrink-0 rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700"
                      >
                        {LEADER_SHORT[r.role]}
                      </span>
                    ))}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.crew_name ?? ""}</span>
                    <span className={cn("shrink-0 text-xs", room ? "text-foreground" : "text-destructive")}>
                      {room ?? "no bed"}
                    </span>
                    {/* Manual lifeboat override — cabin drives it by default. */}
                    <select
                      value={p.lifeboat ?? ""}
                      disabled={pending || readOnly}
                      title="Set muster station manually (overrides the cabin)"
                      onChange={(e) => saveLifeboat(p, e.target.value)}
                      className="shrink-0 rounded border bg-background px-1 py-0.5 text-[11px] text-muted-foreground"
                    >
                      <option value="">LB —</option>
                      {lbOptions.map((lb) => (
                        <option key={lb} value={lb}>{lb}</option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Quick-add a casual/day visitor who is on board now, with a lifeboat. */
function CasualVisitorForm({
  lbOptions,
  installations,
  pending,
  onSubmit,
}: {
  lbOptions: string[];
  installations: Installation[];
  pending: boolean;
  onSubmit: (input: { name: string; company?: string; installationId?: string; lifeboat: string }) => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [lifeboat, setLifeboat] = useState("");
  const ready = name.trim() && lifeboat;
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="mb-2 text-sm font-medium">Casual / day visitor — on board now</p>
      <div className="flex flex-wrap items-end gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Visitor name" className={cn(field, "min-w-40")} />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className={cn(field, "min-w-36")} />
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className={field}>
          <option value="">Installation (optional)</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <select value={lifeboat} onChange={(e) => setLifeboat(e.target.value)} className={field} aria-label="Lifeboat station">
          <option value="">Lifeboat…</option>
          {lbOptions.map((lb) => (
            <option key={lb} value={lb}>{lb}</option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={pending || !ready}
          onClick={() => onSubmit({ name, company: company || undefined, installationId: installationId || undefined, lifeboat })}
        >
          Add to POB
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Counts in POB and appears in the muster roll-call at the chosen lifeboat.
      </p>
    </div>
  );
}
