"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import type { CalibrationAdjustment, CalibrationRosterRow } from "@/types/appraisal";
import { applyCalibration } from "../actions";

export function CalibrationCommittee({
  roster,
  adjustments,
}: {
  roster: CalibrationRosterRow[];
  adjustments: CalibrationAdjustment[];
}) {
  const adjustedIds = useMemo(
    () => new Set(adjustments.map((a) => a.appraisal_id)),
    [adjustments],
  );
  if (roster.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Rating</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {roster.map((r) => (
              <CommitteeRow key={r.id} row={r} adjusted={adjustedIds.has(r.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {adjustments.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Adjustment log</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {adjustments.map((a) => (
              <li key={a.id}>
                <span className="text-foreground">{a.employee_name ?? "—"}</span>:{" "}
                {a.previous_score ?? "—"}% → {a.new_score ?? "—"}% ({a.new_label ?? "—"})
                {a.adjusted_by_name ? ` · ${a.adjusted_by_name}` : ""} ·{" "}
                {new Date(a.created_at).toLocaleDateString()}
                {a.reason ? ` — ${a.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CommitteeRow({ row, adjusted }: { row: CalibrationRosterRow; adjusted: boolean }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(row.final_score != null ? String(row.final_score) : "");
  const [reason, setReason] = useState("");
  const closed = row.status === "closed";

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await applyCalibration({
        appraisalId: row.id,
        newScore: Number(score),
        reason,
      });
      if (!res.ok) setError(res.error ?? "Action failed.");
      else {
        setOpen(false);
        setReason("");
      }
    });
  }

  return (
    <>
      <tr>
        <td className="px-4 py-2 font-medium">
          {row.employee_name || "—"}
          {adjusted && (
            <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
              calibrated
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-muted-foreground">{row.department || "—"}</td>
        <td className="px-4 py-2">{row.final_score != null ? `${row.final_score}%` : "—"}</td>
        <td className="px-4 py-2 text-muted-foreground">{row.rating_label || "—"}</td>
        <td className="px-4 py-2 text-right">
          <div className="flex items-center justify-end gap-2">
            <Link
              href={`/performance/appraisals/${row.id}/outcome`}
              className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              Outcome
            </Link>
            {!closed && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen((v) => !v)}>
                {open ? "Cancel" : "Adjust"}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {open && !closed && (
        <tr>
          <td colSpan={5} className="bg-muted/30 px-4 py-3">
            {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">
                New score %
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  disabled={pending}
                  onChange={(e) => setScore(e.target.value)}
                  className="ml-2 w-24 rounded-md border bg-background px-2 py-1 text-sm"
                />
              </label>
              <input
                value={reason}
                disabled={pending}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for adjustment"
                className="min-w-[200px] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
              />
              <Button size="sm" disabled={pending || !score} onClick={apply}>
                Apply
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
