"use client";

import { useState } from "react";
import Link from "next/link";
import { useStatusTransition } from "@/components/activity";
import { CalendarClock, ChevronLeft, ChevronRight, Play, Repeat, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { ghostShuttles } from "@/lib/transport/shuttles";
import {
  localTime,
  PLANNER_END_HOUR,
  PLANNER_START_HOUR,
  planDay,
  shiftDate,
  timelinePct,
} from "@/lib/transport/day-plan";
import type { Driver, Shuttle, TransportRequest, Vehicle } from "@/types/transport";
import { assignTransport, runShuttlesNow } from "../actions";
import { STATUS_STYLE } from "./task-bits";

/**
 * The dispatcher's day on a clock: one lane per driver, each task a block
 * at its departure time, clashes marked, the unassigned in a pile with an
 * assign picker. Shuttle runs the nightly job has not created yet are
 * drawn as ghosts in their driver's lane, so tomorrow is never blank.
 * Yesterday and tomorrow are one click away.
 */
export function DayPlanner({
  date,
  requests,
  drivers,
  vehicles,
  shuttles,
  clashMinutes,
}: {
  date: string;
  requests: TransportRequest[];
  drivers: Driver[];
  vehicles: Vehicle[];
  shuttles: Shuttle[];
  clashMinutes: number;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const plan = planDay(requests, drivers, clashMinutes);
  const ghosts = ghostShuttles(shuttles, requests, date);
  const laneIds = new Set(drivers.map((d) => d.id));
  const ghostsWithoutLane = ghosts.filter((g) => !g.shuttle.driver_id || !laneIds.has(g.shuttle.driver_id));

  function createRuns() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await runShuttlesNow(date);
      if (!res.ok) setError(res.error ?? "Could not create the runs.");
      else setNotice(`${res.created ?? 0} shuttle run(s) created for the day.`);
    });
  }
  const hours = Array.from({ length: PLANNER_END_HOUR - PLANNER_START_HOUR + 1 }, (_, i) => PLANNER_START_HOUR + i);
  const today = new Date().toISOString().slice(0, 10);

  function assign(id: string, driverId: string | null, vehicleId: string | null) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await assignTransport(id, driverId, vehicleId);
      if (!res.ok) setError(res.error ?? "Could not assign.");
      else if (res.warning) setNotice(res.warning);
    });
  }

  const clashes = plan.lanes.reduce((n, l) => n + l.clashing.size, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-5 w-5 text-primary" /> Day planner
        </h2>
        <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Day">
          <Link href={`/transportation?view=planner&date=${shiftDate(date, -1)}`} className="rounded-md border p-1.5 hover:bg-accent" aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[9rem] text-center font-medium">
            {new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            {date === today && <span className="ml-1 text-xs text-muted-foreground">today</span>}
          </span>
          <Link href={`/transportation?view=planner&date=${shiftDate(date, 1)}`} className="rounded-md border p-1.5 hover:bg-accent" aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {date !== today && (
            <Link href="/transportation?view=planner" className="ml-1 text-xs font-medium text-primary hover:underline">
              Today
            </Link>
          )}
        </nav>
      </div>
      <p className="text-sm text-muted-foreground">
        {plan.liveCount} task{plan.liveCount === 1 ? "" : "s"} on the day · {plan.unassigned.length} unassigned
        {clashes > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            <TriangleAlert className="h-3 w-3" /> {clashes} within {clashMinutes} min of another
          </span>
        )}
      </p>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800">{notice}</p>}
      {ghosts.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <Repeat className="h-3.5 w-3.5" />
          {ghosts.length} shuttle run{ghosts.length === 1 ? "" : "s"} scheduled for the day but not created yet (the job runs at 03:30
          local); shown dashed.
          <Button size="sm" variant="outline" className="ml-auto" disabled={pending} onClick={createRuns}>
            <Play className="h-3.5 w-3.5" /> Create them now
          </Button>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="min-w-[860px]">
          {/* Hour ruler */}
          <div className="flex border-b text-[10px] text-muted-foreground">
            <div className="w-40 shrink-0 border-r px-3 py-1.5 font-medium text-foreground">Driver</div>
            <div className="relative h-6 flex-1">
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute top-1 -translate-x-1/2"
                  style={{ left: `${((h - PLANNER_START_HOUR) / (PLANNER_END_HOUR - PLANNER_START_HOUR)) * 100}%` }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>
          {plan.lanes.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No active drivers. Add them under Vehicles &amp; drivers.</p>
          )}
          {plan.lanes.map((lane) => (
            <div key={lane.driver.id} className="flex border-b last:border-b-0">
              <div className="w-40 shrink-0 border-r px-3 py-2 text-sm">
                <p className="truncate font-medium">{lane.driver.full_name}</p>
                <p className={cn("text-[11px]", lane.driver.on_duty ? "text-green-700" : "text-muted-foreground")}>
                  {lane.driver.on_duty ? "on duty" : "off duty"} · {lane.tasks.length} task{lane.tasks.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="relative h-14 flex-1">
                {hours.map((h) => (
                  <span
                    key={h}
                    className="absolute inset-y-0 border-l border-dashed border-border/60"
                    style={{ left: `${((h - PLANNER_START_HOUR) / (PLANNER_END_HOUR - PLANNER_START_HOUR)) * 100}%` }}
                  />
                ))}
                {lane.tasks.map((t) => (
                  <div
                    key={t.id}
                    title={`${localTime(t.depart_at)} · ${t.pickup} → ${t.dropoff}${t.requester_name ? ` · ${t.requester_name}` : ""}`}
                    className={cn(
                      "absolute top-2 h-10 w-36 -translate-x-1 overflow-hidden rounded-md border px-2 py-1 text-[11px] leading-tight shadow-sm",
                      STATUS_STYLE[t.status],
                      lane.clashing.has(t.id) && "ring-2 ring-amber-400",
                    )}
                    style={{ left: `${timelinePct(t.depart_at)}%` }}
                  >
                    <p className="truncate font-semibold">
                      {localTime(t.depart_at)} {t.pickup}
                    </p>
                    <p className="truncate">→ {t.dropoff}</p>
                  </div>
                ))}
                {ghosts
                  .filter((g) => g.shuttle.driver_id === lane.driver.id)
                  .map((g) => (
                    <div
                      key={`ghost-${g.shuttle.id}`}
                      title={`${localTime(g.departAt)} · ${g.shuttle.name} (shuttle, not created yet)`}
                      className="absolute top-2 h-10 w-36 -translate-x-1 overflow-hidden rounded-md border border-dashed border-muted-foreground/60 bg-muted/40 px-2 py-1 text-[11px] leading-tight text-muted-foreground"
                      style={{ left: `${timelinePct(g.departAt)}%` }}
                    >
                      <p className="truncate font-semibold">
                        {localTime(g.departAt)} {g.shuttle.pickup}
                      </p>
                      <p className="truncate">→ {g.shuttle.dropoff}</p>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Unassigned ({plan.unassigned.length})</h3>
        {plan.unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every task on the day has a driver.</p>
        ) : (
          plan.unassigned.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <span className="font-mono text-xs">{localTime(r.depart_at)}</span>
              <span className="font-medium">
                {r.pickup} → {r.dropoff}
              </span>
              <span className="text-xs text-muted-foreground">
                {r.passengers} pax{r.requester_name ? ` · ${r.requester_name}` : ""}
                {r.status === "awaiting_approval" ? " · awaiting approval" : ""}
              </span>
              {r.status !== "awaiting_approval" && (
                <span className="ml-auto flex gap-1.5">
                  <LazySelect
                    value={null}
                    options={drivers}
                    getOptionValue={(d) => d.id}
                    getOptionLabel={(d) => `${d.full_name}${d.on_duty ? "" : " (off duty)"}`}
                    placeholder="Assign driver…"
                    disabled={pending}
                    className="rounded-md border border-amber-400 bg-amber-50 px-1.5 py-1 text-xs font-medium text-amber-900"
                    onChange={(v) => v && assign(r.id, v, r.vehicle_id)}
                  />
                  <LazySelect
                    value={r.vehicle_id ?? null}
                    options={vehicles}
                    getOptionValue={(v) => v.id}
                    getOptionLabel={(v) => v.name}
                    placeholder="Vehicle…"
                    disabled={pending}
                    className="rounded-md border bg-background px-1.5 py-1 text-xs"
                    onChange={(v) => assign(r.id, r.driver_id, v)}
                  />
                </span>
              )}
            </div>
          ))
        )}
        {ghostsWithoutLane.length > 0 && (
          <div className="space-y-1">
            {ghostsWithoutLane.map((g) => (
              <div key={`ghost-${g.shuttle.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{localTime(g.departAt)}</span>
                <Repeat className="h-3.5 w-3.5" />
                <span className="font-medium">{g.shuttle.name}</span>
                <span>
                  {g.shuttle.pickup} → {g.shuttle.dropoff}
                </span>
                <span className="text-xs">{g.shuttle.driver_name ? `${g.shuttle.driver_name} (not on the active list)` : "no driver on the schedule"} · not created yet</span>
              </div>
            ))}
          </div>
        )}
        {plan.orphaned.length > 0 && (
          <p className="text-xs text-amber-800">
            {plan.orphaned.length} task{plan.orphaned.length === 1 ? " is" : "s are"} assigned to a driver no longer on the active list.
          </p>
        )}
      </section>
    </div>
  );
}
