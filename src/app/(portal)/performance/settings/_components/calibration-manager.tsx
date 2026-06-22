"use client";

import { useState } from "react";
import { Plus, Trash2, Check, Lock, LockOpen, BadgeCheck } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  APPROVAL_ROLES,
  APPROVAL_ROLE_LABEL,
  CALIBRATION_MODE_LABEL,
  GROUP_BYS,
  GROUP_BY_LABEL,
  GROUP_STATUS_LABEL,
  type CalibrationGroup,
  type CalibrationMode,
  type CalibrationSettings,
  type DistributionBand,
  type GroupBy,
  type GroupStatus,
} from "@/types/calibration";
import {
  saveCalibrationSettings,
  createCalibrationGroup,
  deleteCalibrationGroup,
  setCalibrationGroupStatus,
} from "../calibration-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
type CycleOpt = { id: string; name: string };

export function CalibrationManager({
  settings,
  groups,
  cycles,
}: {
  settings: CalibrationSettings;
  groups: CalibrationGroup[];
  cycles: CycleOpt[];
}) {
  return (
    <div className="space-y-6">
      <SettingsForm settings={settings} />
      <GroupsManager groups={groups} cycles={cycles} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: CalibrationSettings }) {
  const [s, setS] = useState(settings);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof CalibrationSettings>(k: K, v: CalibrationSettings[K]) => {
    setSaved(false);
    setS({ ...s, [k]: v });
  };
  const setBand = (i: number, patch: Partial<DistributionBand>) =>
    set("distribution", s.distribution.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const total = s.distribution.reduce((sum, b) => sum + (b.percent || 0), 0);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveCalibrationSettings(s);
      if (!res.ok) setError(res.error ?? "Couldn't save.");
      else setSaved(true);
    });
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="font-medium">Defaults</h2>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs text-muted-foreground">
          Mode
          <select value={s.mode} onChange={(e) => set("mode", e.target.value as CalibrationMode)} className={cn(field, "mt-0.5 block py-1.5")}>
            {(["forced", "guidance"] as CalibrationMode[]).map((m) => (
              <option key={m} value={m}>{CALIBRATION_MODE_LABEL[m]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Adjustment limit (levels)
          <input type="number" min={0} max={5} value={s.adjustmentLimit} onChange={(e) => set("adjustmentLimit", Number(e.target.value))} className={cn(field, "mt-0.5 block w-24 py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Approval authority
          <select value={s.approvalRole} onChange={(e) => set("approvalRole", e.target.value)} className={cn(field, "mt-0.5 block py-1.5")}>
            {APPROVAL_ROLES.map((r) => (
              <option key={r} value={r}>{APPROVAL_ROLE_LABEL[r]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Default grouping
          <select value={s.defaultGroupBy} onChange={(e) => set("defaultGroupBy", e.target.value as GroupBy)} className={cn(field, "mt-0.5 block py-1.5")}>
            {GROUP_BYS.map((g) => (
              <option key={g} value={g}>{GROUP_BY_LABEL[g]}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Target distribution</p>
          <span className="text-xs">
            Total <span className={cn("font-semibold", total === 100 ? "text-green-700" : "text-destructive")}>{total}%</span>
          </span>
        </div>
        <div className="space-y-1.5">
          {s.distribution.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={b.label} onChange={(e) => setBand(i, { label: e.target.value })} placeholder="Band" className={cn(field, "py-1")} />
              <input type="number" min={0} max={100} value={b.percent} onChange={(e) => setBand(i, { percent: Number(e.target.value) })} className={cn(field, "w-20 py-1")} />
              <span className="text-xs text-muted-foreground">%</span>
              <Button variant="ghost" size="sm" onClick={() => set("distribution", s.distribution.filter((_, j) => j !== i))} aria-label="Remove band">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => set("distribution", [...s.distribution, { label: "", percent: 0 }])}>
          <Plus className="h-4 w-4" /> Add band
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle label="Require justification for adjustments" checked={s.requireJustification} onChange={(v) => set("requireJustification", v)} />
        <Toggle label="Show preliminary ratings to managers" checked={s.confidentiality.showPreliminaryToManagers} onChange={(v) => set("confidentiality", { ...s.confidentiality, showPreliminaryToManagers: v })} />
        <Toggle label="Show adjustment reasons" checked={s.confidentiality.showAdjustmentReasons} onChange={(v) => set("confidentiality", { ...s.confidentiality, showAdjustmentReasons: v })} />
        <Toggle label="Anonymise names in charts" checked={s.confidentiality.anonymizeInCharts} onChange={(v) => set("confidentiality", { ...s.confidentiality, anonymizeInCharts: v })} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          <Check className="h-4 w-4" /> Save defaults
        </Button>
        {saved && !pending && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </section>
  );
}

function GroupsManager({ groups, cycles }: { groups: CalibrationGroup[]; cycles: CycleOpt[] }) {
  const [name, setName] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [groupValue, setGroupValue] = useState("");
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? "");
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const cycleName = (id: string | null) => cycles.find((c) => c.id === id)?.name ?? "—";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else after?.();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <h2 className="font-medium">Calibration groups</h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering" className={cn(field, "mt-0.5 block w-44 py-1.5")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Group by
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={cn(field, "mt-0.5 block py-1.5")}>
            {GROUP_BYS.map((g) => (
              <option key={g} value={g}>{GROUP_BY_LABEL[g]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Value
          <input value={groupValue} onChange={(e) => setGroupValue(e.target.value)} placeholder="e.g. Engineering" className={cn(field, "mt-0.5 block w-40 py-1.5")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Cycle
          <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className={cn(field, "mt-0.5 block py-1.5")}>
            <option value="">(none)</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => createCalibrationGroup({ cycleId: cycleId || null, name, groupBy, groupValue }),
              () => {
                setName("");
                setGroupValue("");
              },
            )
          }
        >
          <Plus className="h-4 w-4" /> Add group
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No calibration groups yet.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  {g.name}{" "}
                  <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {GROUP_STATUS_LABEL[g.status]}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {GROUP_BY_LABEL[g.groupBy]}
                  {g.groupValue ? `: ${g.groupValue}` : ""} · {cycleName(g.cycleId)}
                </p>
              </div>
              <div className="flex gap-1">
                <StatusButton status={g.status} pending={pending} onSet={(st) => run(() => setCalibrationGroupStatus(g.id, st))} />
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => deleteCalibrationGroup(g.id))} aria-label="Delete group">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusButton({
  status,
  pending,
  onSet,
}: {
  status: GroupStatus;
  pending: boolean;
  onSet: (s: GroupStatus) => void;
}) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 text-xs text-green-700">
        <BadgeCheck className="h-4 w-4" /> Approved
      </span>
    );
  }
  const next: GroupStatus = status === "open" ? "locked" : "approved";
  const Icon = status === "open" ? Lock : LockOpen;
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => onSet(next)}>
      <Icon className="h-4 w-4" /> {status === "open" ? "Lock" : "Approve"}
    </Button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-background p-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
