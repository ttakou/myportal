"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type Crew, type RotationCalendar, type RotationDay } from "@/types/offshore";
import { field } from "./shared";

/**
 * Rotation calendar: the weeks ahead, crew by crew, and the back-to-back
 * pairs behind them.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

const ROTATION_CELL: Record<RotationDay, string> = {
  offshore: "bg-primary",
  onshore: "bg-blue-500",
  change_out: "bg-amber-500",
  change_in: "bg-green-500",
};

/** Crew-name text colour by today's rotation status (mirrors ROTATION_CELL). */
const ROTATION_TEXT: Record<RotationDay, string> = {
  offshore: "text-primary",
  onshore: "text-blue-600",
  change_out: "text-amber-600",
  change_in: "text-green-600",
};

export function RotationCalendarPanel({ calendar, crews }: { calendar: RotationCalendar; crews: Crew[] }) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const [repFrom, setRepFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [repWeeks, setRepWeeks] = useState(8);
  // Find today's column so each crew name can be coloured by where the crew is
  // right now (offshore vs onshore); fall back to the first plotted day.
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayIdx = calendar.days.indexOf(todayIso);
  const statusCol = todayIdx >= 0 ? todayIdx : 0;
  // Label every 7th day to keep the header readable.
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Weeks
          <input type="number" min={1} max={26} value={repWeeks} onChange={(e) => setRepWeeks(Number(e.target.value) || 8)} className={cn(field, "mt-0.5 block w-20 py-1")} />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!repFrom}
          onClick={() => window.open(`/offshore-rotation?from=${repFrom}&weeks=${repWeeks}`, "_blank")}
        >
          <FileText className="h-4 w-4" /> Open report (A3)
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" /> Offshore</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-500" /> Onshore</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500" /> Crew change (out)</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-green-500" /> Crew change (in)</span>
      </div>

      {calendar.crews.length === 0 && (
        <p className="text-sm text-muted-foreground">No active crews to plot.</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left">Crew</th>
              {calendar.days.map((d, i) => (
                <th key={d} className="px-0 py-1 text-center font-normal text-muted-foreground" style={{ minWidth: 10 }}>
                  {i % 7 === 0 ? <span className="block -rotate-0 text-[9px]">{fmt(d)}</span> : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.crews.map((c) => {
              const todayStatus = c.statuses[statusCol] ?? null;
              return (
              <tr key={c.id} className="border-t">
                <td className="sticky left-0 z-10 bg-card px-2 py-1 align-top">
                  <div
                    className={cn("font-medium", todayStatus ? ROTATION_TEXT[todayStatus] : "")}
                    title={todayStatus ? `Currently ${todayStatus.replace("_", " ")}` : "No rotation plotted"}
                  >
                    {c.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {c.offshore_days}/{c.onshore_days} · {c.member_count}
                  </div>
                </td>
                {c.statuses.map((s, i) => (
                  <td key={i} className="p-0">
                    <div
                      title={`${calendar.days[i]}${s ? ` · ${s.replace("_", " ")}` : ""}`}
                      className={cn("h-6 w-[10px]", s ? ROTATION_CELL[s] : "bg-transparent")}
                    />
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Bands are derived from each crew&apos;s rotation pattern and cycle start date. Set a cycle
        start on the Crew change tab to plot a crew. Each crew name is tinted by where the crew is
        today (offshore / onshore / crew change).
      </p>

      <CrewBackToBackList calendar={calendar} crews={crews} />
    </div>
  );
}

/** Crew-level back-to-back (the crew offshore while this one is ashore) + members. */
function CrewBackToBackList({ calendar, crews }: { calendar: RotationCalendar; crews: Crew[] }) {
  const EPOCH = new Date("2026-01-01T00:00:00Z").getTime();
  const DAY = 86_400_000;
  const phaseOf = (c: Crew) => {
    if (!c.cycle_start_date) return null;
    const cycle = c.offshore_days + c.onshore_days;
    if (cycle <= 0) return null;
    const d = Math.floor((new Date(c.cycle_start_date + "T00:00:00Z").getTime() - EPOCH) / DAY);
    return (((d % cycle) + cycle) % cycle);
  };
  const active = crews.filter((c) => c.is_active && c.cycle_start_date);
  // back-to-back = same pattern, phase offset by offshore_days (relieves this crew)
  const b2bOf = (c: Crew): Crew | null => {
    const cycle = c.offshore_days + c.onshore_days;
    const p = phaseOf(c);
    if (p === null) return null;
    const want = (p + c.offshore_days) % cycle;
    return (
      active.find(
        (o) =>
          o.id !== c.id &&
          o.offshore_days === c.offshore_days &&
          o.onshore_days === c.onshore_days &&
          phaseOf(o) === want,
      ) ?? null
    );
  };
  const membersByCrew = new Map(calendar.crews.map((c) => [c.id, c.members]));
  const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Crews · back-to-back &amp; members</h4>
      <div className="grid gap-2 lg:grid-cols-2">
        {sorted.map((c) => {
          const b2b = b2bOf(c);
          const members = membersByCrew.get(c.id) ?? [];
          return (
            <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.offshore_days}/{c.onshore_days} · {members.length} member(s)
                </span>
              </div>
              <p className="mt-0.5 text-xs">
                Back-to-back:{" "}
                <span className={cn("font-medium", b2b ? "text-foreground" : "text-muted-foreground")}>
                  {b2b ? b2b.name : "— none on opposite phase —"}
                </span>
              </p>
              {members.length > 0 && (
                <ol className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {members.map((m, i) => (
                    <li key={i}>
                      <span className="mr-1 tabular-nums text-muted-foreground/70">{i + 1}.</span>
                      {m}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No crews with a cycle start to pair.</p>
        )}
      </div>
    </div>
  );
}
