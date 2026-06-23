"use client";

import { useState } from "react";
import { Check, AlertTriangle, Users, ArrowRight, ArrowUp } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CALIBRATION_GATES, GATE_LABEL, type CalibrationGate } from "@/types/calibration-panel";
import type { DistributionBand } from "@/types/calibration";
import type { PanelData } from "@/lib/calibration-panel";
import type { DirectoryEntry } from "@/lib/continuous";
import {
  setPanelMembers,
  submitPanelRating,
  setCalibrationGate,
  setGroupDistribution,
  finalisePanelRating,
} from "../../settings/calibration-panel-actions";

const field = "rounded-md border bg-background px-2 py-1 text-sm";

export function PanelCalibration({ data, directory }: { data: PanelData; directory: DirectoryEntry[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const bands = data.target.map((t) => t.label);
  const canRate = data.isMember || data.isHr;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {/* Distribution vs target + balance */}
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Distribution vs target</h2>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              data.balance.withinLimits ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
            )}
          >
            {data.balance.withinLimits ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {data.balance.withinLimits ? "Within limits" : "Imbalanced"}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.balance.bands.map((b) => (
            <div key={b.label} className={cn("rounded-md border p-2.5", b.over && "border-amber-400 bg-amber-50")}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{b.label}</span>
                <span className={cn(b.over && "text-amber-700")}>
                  {b.count}
                  {b.targetMax != null ? ` / ${b.targetMax}` : ""}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {b.actualPercent}%{b.targetPercent != null ? ` · target ${b.targetPercent}%` : " · no cap"}
              </p>
            </div>
          ))}
        </div>
        {data.balance.suggestions.length > 0 && (
          <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            {data.balance.suggestions.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}
        {data.isHr && <PercentEditor groupId={data.group.id} target={data.target} pending={pending} run={run} />}
      </section>

      {/* Panel members (HR) */}
      {data.isHr && (
        <section className="space-y-2 rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Users className="h-4 w-4" /> Panel members
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {data.members.map((m) => (
              <span key={m.memberId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                {m.name}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={pending}
                  onClick={() =>
                    run(() => setPanelMembers(data.group.id, data.members.filter((x) => x.memberId !== m.memberId).map((x) => x.memberId)))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {data.members.length === 0 && <span className="text-xs text-muted-foreground">No panel set.</span>}
          </div>
          <select
            value=""
            disabled={pending}
            onChange={(e) => {
              if (!e.target.value) return;
              run(() => setPanelMembers(data.group.id, [...data.members.map((m) => m.memberId), e.target.value]));
            }}
            className={cn(field, "py-1.5")}
          >
            <option value="">Add a panel member…</option>
            {directory
              .filter((d) => !data.members.some((m) => m.memberId === d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
          </select>
        </section>
      )}

      {/* PGM finalisation gate banner */}
      {data.isHr && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm",
            data.panelComplete ? "bg-green-100 text-green-800" : "bg-amber-50 text-amber-800",
          )}
        >
          {data.panelComplete ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {data.panelComplete ? (
            <span>The panel has finished — you can now finalise PGM ratings.</span>
          ) : (
            <span>
              PGM finalisation unlocks once the panel rates everyone ({data.panelProgress.rated}/
              {data.panelProgress.expected} done).
            </span>
          )}
        </div>
      )}

      {/* Staff ratings, grouped by rating band (top contributors → lowest) */}
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="font-medium">Staff ({data.staff.length})</h2>
        {data.staff.length === 0 && <p className="text-sm text-muted-foreground">No scored staff in this group yet.</p>}
        {groupByBand(data).map(({ label, people }) => (
          <div key={label ?? "__unrated"} className="space-y-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span>{label ?? "Not yet rated"}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                {people.length}
              </span>
            </h3>
            <ul className="divide-y">
              {people.map((s) => (
                <StaffRow
                  key={s.appraisalId}
                  groupId={data.group.id}
                  staff={s}
                  bands={bands}
                  bandOrder={data.bandOrder}
                  panelComplete={data.panelComplete}
                  canRate={canRate}
                  isHr={data.isHr}
                  mine={data.myRatings[s.appraisalId]}
                  others={data.ratingsByStaff[s.appraisalId] ?? []}
                  pending={pending}
                  run={run}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Group staff by their panel-agreed band, ordered top contributors → lowest,
 *  with any not-yet-rated staff last. */
function groupByBand(data: PanelData): { label: string | null; people: PanelData["staff"] }[] {
  const buckets = new Map<string | null, PanelData["staff"]>();
  for (const s of data.staff) {
    const key = s.panelBand ?? null;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(s);
  }
  const out: { label: string | null; people: PanelData["staff"] }[] = [];
  for (const label of data.bandOrder) {
    const people = buckets.get(label);
    if (people && people.length) out.push({ label, people });
  }
  const unrated = buckets.get(null);
  if (unrated && unrated.length) out.push({ label: null, people: unrated });
  return out;
}

function PercentEditor({
  groupId,
  target,
  pending,
  run,
}: {
  groupId: string;
  target: DistributionBand[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [bands, setBands] = useState<DistributionBand[]>(target);
  const total = bands.reduce((s, b) => s + (b.percent || 0), 0);
  return (
    <div className="border-t pt-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Target percentages (at rating time)</p>
      <div className="flex flex-wrap items-end gap-2">
        {bands.map((b, i) => (
          <label key={b.label} className="text-xs text-muted-foreground">
            {b.label}
            <input
              type="number"
              min={0}
              max={100}
              value={b.percent}
              onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))}
              className={cn(field, "mt-0.5 block w-20")}
            />
          </label>
        ))}
        <span className="text-xs">
          Total <span className={cn("font-semibold", total === 100 ? "text-green-700" : "text-amber-700")}>{total}%</span>
        </span>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setGroupDistribution(groupId, bands))}>
          <Check className="h-4 w-4" /> Save percentages
        </Button>
      </div>
    </div>
  );
}

function StaffRow({
  groupId,
  staff,
  bands,
  bandOrder,
  panelComplete,
  canRate,
  isHr,
  mine,
  others,
  pending,
  run,
}: {
  groupId: string;
  staff: PanelData["staff"][number];
  bands: string[];
  bandOrder: string[];
  panelComplete: boolean;
  canRate: boolean;
  isHr: boolean;
  mine?: { bandLabel: string; comment: string | null };
  others: { memberName: string; bandLabel: string; comment: string | null }[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [band, setBand] = useState(mine?.bandLabel ?? "");
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [pgmBand, setPgmBand] = useState(staff.panelBand ?? "");
  const [pgmComment, setPgmComment] = useState("");
  const gateIdx = CALIBRATION_GATES.indexOf(staff.gate);
  const nextGate = CALIBRATION_GATES[gateIdx + 1] as CalibrationGate | undefined;

  // A lower rank index = higher band; rank beyond the list sits last.
  const rankOf = (label: string) => {
    const i = bandOrder.indexOf(label);
    return i === -1 ? 99 : i;
  };
  // Rating below the panel-agreed band is a downgrade → PGM comment required.
  const isDowngrade =
    !!pgmBand && staff.panelBand != null && rankOf(pgmBand) > rankOf(staff.panelBand);
  const finaliseBlocked = !panelComplete || !pgmBand || (isDowngrade && !pgmComment.trim());

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {staff.name}
            {staff.upgradeCandidate && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                <ArrowUp className="h-3 w-3" /> May upgrade
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Provisional: {staff.provisionalLabel ?? "—"}
            {staff.provisionalScore != null ? ` (${staff.provisionalScore}%)` : ""} · Panel:{" "}
            <span className="font-medium">{staff.panelBand ?? "—"}</span> ·{" "}
            <span className="rounded-full bg-muted px-1.5 py-0.5">{GATE_LABEL[staff.gate]}</span>
          </p>
        </div>
        {isHr && staff.gate === "pgm" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Panel: {staff.panelBand ?? "—"}</span>
            <select
              value={pgmBand}
              onChange={(e) => setPgmBand(e.target.value)}
              className={field}
              aria-label="PGM final rating"
              disabled={!panelComplete}
            >
              <option value="">Final rating…</option>
              {bands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {isDowngrade && (
              <input
                value={pgmComment}
                onChange={(e) => setPgmComment(e.target.value)}
                placeholder="Reason for downgrade (required)"
                className={cn(field, "min-w-[12rem]")}
                aria-label="PGM downgrade comment"
              />
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={pending || finaliseBlocked}
              title={!panelComplete ? "The panel must finish rating everyone first." : undefined}
              onClick={() => run(() => finalisePanelRating(groupId, staff.appraisalId, pgmBand, pgmComment))}
            >
              <Check className="h-4 w-4" /> {pgmBand === staff.panelBand ? "Confirm" : "Finalise"}
            </Button>
          </div>
        ) : (
          isHr && nextGate && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setCalibrationGate(staff.appraisalId, nextGate, groupId))}>
              <ArrowRight className="h-4 w-4" /> {GATE_LABEL[nextGate]}
            </Button>
          )
        )}
      </div>

      {canRate && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={band} onChange={(e) => setBand(e.target.value)} className={field}>
            <option value="">Your rating…</option>
            {bands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment"
            className={cn(field, "min-w-[12rem] flex-1")}
          />
          <Button
            size="sm"
            disabled={pending || !band}
            onClick={() => run(() => submitPanelRating({ groupId, appraisalId: staff.appraisalId, bandLabel: band, comment }))}
          >
            Save
          </Button>
        </div>
      )}

      {others.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 pl-1 text-xs text-muted-foreground">
          {others.map((r, i) => (
            <li key={i}>
              <span className="font-medium">{r.memberName}:</span> {r.bandLabel}
              {r.comment ? ` — ${r.comment}` : ""}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
