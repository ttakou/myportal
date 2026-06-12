"use client";

import { useMemo } from "react";
import { BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Driver, TransportRequest } from "@/types/transport";

/**
 * Dispatch analytics computed client-side from the task list the board already
 * has — no extra fetch. Summary KPIs, per-driver load, busiest routes, and a
 * CSV export for the fleet manager.
 */
export function TransportAnalytics({
  all,
  drivers,
}: {
  all: TransportRequest[];
  drivers: Driver[];
}) {
  const stats = useMemo(() => {
    const total = all.length;
    const completed = all.filter((r) => r.status === "completed").length;
    const cancelled = all.filter((r) => r.status === "cancelled").length;
    const inProgress = all.filter((r) => r.status === "in_progress").length;
    const finished = completed + cancelled;
    const completionRate = finished > 0 ? Math.round((completed / finished) * 100) : null;

    const driverName = new Map(drivers.map((d) => [d.id, d.full_name]));
    const perDriver = new Map<string, { name: string; active: number; completed: number }>();
    for (const r of all) {
      if (!r.driver_id) continue;
      const name = driverName.get(r.driver_id) ?? r.driver_name ?? "Unknown";
      const row = perDriver.get(r.driver_id) ?? { name, active: 0, completed: 0 };
      if (r.status === "completed") row.completed++;
      else if (r.status === "assigned" || r.status === "in_progress") row.active++;
      perDriver.set(r.driver_id, row);
    }
    const byDriver = [...perDriver.values()].sort(
      (a, b) => b.completed + b.active - (a.completed + a.active),
    );

    const routeCount = new Map<string, number>();
    for (const r of all) {
      const key = `${r.pickup} → ${r.dropoff}`;
      routeCount.set(key, (routeCount.get(key) ?? 0) + 1);
    }
    const topRoutes = [...routeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { total, completed, cancelled, inProgress, completionRate, byDriver, topRoutes };
  }, [all, drivers]);

  function exportCsv() {
    const headers = [
      "Date",
      "Type",
      "Priority",
      "Status",
      "Pickup",
      "Dropoff",
      "Passengers",
      "Requester",
      "Driver",
      "Vehicle",
    ];
    const rows = all.map((r) => [
      r.depart_at,
      r.task_type,
      r.priority,
      r.status,
      r.pickup,
      r.dropoff,
      String(r.passengers),
      r.requester_name ?? "",
      r.driver_name ?? "",
      r.vehicle_name ?? "",
    ]);
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transport-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (stats.total === 0) return null;

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <BarChart3 className="h-4 w-4" /> Analytics
      </summary>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label="Total tasks" value={stats.total} />
        <Kpi label="Completed" value={stats.completed} />
        <Kpi label="In progress" value={stats.inProgress} />
        <Kpi label="Cancelled" value={stats.cancelled} />
        <Kpi
          label="Completion"
          value={stats.completionRate === null ? "—" : `${stats.completionRate}%`}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tasks per driver
          </p>
          <div className="space-y-1 text-sm">
            {stats.byDriver.map((d) => (
              <div key={d.name} className="flex items-center justify-between">
                <span>{d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {d.completed} done · {d.active} active
                </span>
              </div>
            ))}
            {stats.byDriver.length === 0 && (
              <p className="text-xs text-muted-foreground">No assignments yet.</p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Busiest routes
          </p>
          <div className="space-y-1 text-sm">
            {stats.topRoutes.map(([route, n]) => (
              <div key={route} className="flex items-center justify-between gap-2">
                <span className="truncate">{route}</span>
                <span className="text-xs text-muted-foreground">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>
    </details>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-background p-2 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
