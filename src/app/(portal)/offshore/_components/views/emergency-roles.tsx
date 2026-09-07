"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import {
  EMERGENCY_ROLE_LABEL,
  EMERGENCY_TEAM_LABEL,
  type EmergencyRole,
  type EmergencyRoleKind,
  type EmergencyTeamMember,
  type RosterEntry,
} from "@/types/offshore";
import {
  deleteEmergencyWindow,
  setEmergencyRole,
  addEmergencyTeamMember,
  removeEmergencyTeamMember,
} from "../../actions";
import { field, EMERGENCY_ORDER, EMERGENCY_TEAMS, useRun } from "./shared";

/**
 * Muster roles: emergency-response positions and team membership.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

/** Per rotation window + muster group: evacuation & head-count role holders. */
export function EmergencyRolesPanel({
  roles,
  teams,
  musterGroups,
  roster,
}: {
  roles: EmergencyRole[];
  teams: EmergencyTeamMember[];
  musterGroups: string[];
  roster: RosterEntry[];
}) {
  const { pending, error, run } = useRun();
  const today = new Date().toISOString().slice(0, 10);

  const windows = useMemo(() => {
    const seen = new Map<string, { from: string; to: string }>();
    for (const r of [...roles, ...teams]) {
      const k = r.from_date + "|" + r.to_date;
      if (!seen.has(k)) seen.set(k, { from: r.from_date, to: r.to_date });
    }
    return [...seen.values()].sort((a, b) => b.from.localeCompare(a.from));
  }, [roles, teams]);

  const [from, setFrom] = useState(windows[0]?.from ?? today);
  const [to, setTo] = useState(windows[0]?.to ?? today);

  const groups = musterGroups.length
    ? musterGroups
    : [...new Set(roles.map((r) => r.lifeboat))].sort() ;
  const people = [...roster]
    .map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const holder = (group: string, role: EmergencyRoleKind) =>
    roles.find(
      (r) => r.from_date === from && r.to_date === to && r.lifeboat === group && r.role === role,
    )?.profile_id ?? "";

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Evacuation &amp; head-count leaders per muster group, fixed for a rotation window (they stay
        the same across the crews aboard).
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-3">
        <label className="text-xs text-muted-foreground">
          Rotation from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        {windows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Existing:</span>
            {windows.map((w) => (
              <button
                key={w.from + w.to}
                onClick={() => { setFrom(w.from); setTo(w.to); }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent",
                  from === w.from && to === w.to && "ring-1 ring-primary",
                )}
              >
                {w.from} → {w.to}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No muster groups configured. Set a room&apos;s muster (Accommodation tab) first.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g} className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{g}</span>
                <span className="text-xs text-muted-foreground">muster group</span>
              </div>
              <div className="grid gap-2">
                {EMERGENCY_ORDER.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">{EMERGENCY_ROLE_LABEL[role]}</span>
                    <LazySelect
                      value={holder(g, role) || null}
                      options={people}
                      getOptionValue={(p) => p.id}
                      getOptionLabel={(p) => p.name}
                      placeholder="— none —"
                      disabled={pending || !from || !to}
                      className={cn(field, "flex-1 py-1")}
                      onChange={(v) =>
                        run(() => setEmergencyRole({ fromDate: from, toDate: to, lifeboat: g, role, profileId: v }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Response teams</p>
        <p className="text-xs text-muted-foreground">
          HLO and fire teams for this window — installation-wide, with no member limit.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {EMERGENCY_TEAMS.map((team) => {
            const members = teams.filter(
              (t) => t.from_date === from && t.to_date === to && t.team === team,
            );
            const memberIds = new Set(members.map((m) => m.profile_id));
            return (
              <div key={team} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    {EMERGENCY_TEAM_LABEL[team]}
                  </span>
                  <span className="text-xs text-muted-foreground">{members.length} member(s)</span>
                </div>
                {members.length > 0 ? (
                  <ul className="mb-2 flex flex-wrap gap-1">
                    {members.map((m) => (
                      <li
                        key={m.id}
                        className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
                      >
                        <span>{m.person_name ?? "—"}</span>
                        <button
                          disabled={pending}
                          title={`Remove ${m.person_name ?? "member"}`}
                          onClick={() => run(() => removeEmergencyTeamMember(m.id))}
                          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-2 text-xs italic text-muted-foreground">No members yet.</p>
                )}
                <LazySelect
                  value={null}
                  options={people.filter((p) => !memberIds.has(p.id))}
                  getOptionValue={(p) => p.id}
                  getOptionLabel={(p) => p.name}
                  placeholder="— add person —"
                  disabled={pending || !from || !to}
                  className={cn(field, "w-full py-1")}
                  onChange={(v) =>
                    v && run(() => addEmergencyTeamMember({ fromDate: from, toDate: to, team, profileId: v }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {windows.some((w) => w.from === from && w.to === to) && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm(`Clear all muster roles for ${from} → ${to}?`))
              run(() => deleteEmergencyWindow(from, to));
          }}
        >
          Clear this window
        </Button>
      )}
    </div>
  );
}
