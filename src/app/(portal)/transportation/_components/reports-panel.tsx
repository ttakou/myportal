"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, FileBarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportFilters } from "@/app/(portal)/reports/_components/report-filters";
import { CsvExportButton } from "@/app/(portal)/reports/_components/csv-export-button";
import { PrintButton } from "@/app/(portal)/reports/_components/print-button";
import { DAY_LABELS } from "@/lib/transport/shuttles";
import { TASK_TYPE_LABEL, TRANSPORT_STATUS_LABEL, PRIORITY_LABEL, type TransportStatus, type TransportTaskType, type TransportPriority } from "@/types/transport";
import type { TransportReports } from "@/lib/transport-reports";

export type ReportKey = "overview" | "drivers" | "vehicles" | "requesters" | "routes" | "peaks" | "shuttles" | "approvals";

export const REPORT_TABS: { key: ReportKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "drivers", label: "Drivers" },
  { key: "vehicles", label: "Vehicles & fuel" },
  { key: "requesters", label: "Requesters" },
  { key: "routes", label: "Routes" },
  { key: "peaks", label: "Peak times" },
  { key: "shuttles", label: "Shuttles" },
  { key: "approvals", label: "Approvals" },
];

const n = (v: number | null | undefined, suffix = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("en-GB")}${suffix}`);
const s = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/**
 * The transportation reports, one at a time: a period, a report picker,
 * KPI tiles, a table, and a CSV of the table. Everything is computed on
 * the server from the period's requests; this only lays it out.
 */
export function ReportsPanel({
  data,
  report,
  onTimeMinutes,
  footer,
}: {
  data: TransportReports;
  report: ReportKey;
  onTimeMinutes: number;
  /** The letterhead stamp, rendered by the server page. */
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (key: ReportKey) => {
    const next = new URLSearchParams(params.toString());
    next.set("view", "reports");
    next.set("report", key);
    router.push(`${pathname}?${next.toString()}`);
  };
  const period = `${data.from} → ${data.to}`;
  const { table, filename } = csvFor(report, data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5 text-primary" /> Transportation reports
        </h2>
        <span className="text-sm text-muted-foreground">{period}</span>
        <span className="ml-auto flex items-center gap-2 print:hidden">
          <CsvExportButton filename={filename} table={table} />
          <PrintButton />
          <Link href="/reports/transport" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            <FileBarChart className="h-4 w-4" /> SLA report
          </Link>
        </span>
      </div>

      <div className="print:hidden">
        <ReportFilters show={{ period: true }} from={data.from} to={data.to} />
      </div>

      <nav className="flex flex-wrap gap-1 border-b print:hidden" aria-label="Report">
        {REPORT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => go(t.key)}
            aria-current={t.key === report ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
              t.key === report ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {report === "overview" && <Overview data={data} onTimeMinutes={onTimeMinutes} />}
      {report === "drivers" && <Drivers data={data} onTimeMinutes={onTimeMinutes} />}
      {report === "vehicles" && <Vehicles data={data} />}
      {report === "requesters" && <Requesters data={data} />}
      {report === "routes" && <Routes data={data} />}
      {report === "peaks" && <Peaks data={data} />}
      {report === "shuttles" && <Shuttles data={data} />}
      {report === "approvals" && <Approvals data={data} />}
      {footer}
    </div>
  );
}

// --- Pieces -----------------------------------------------------------------------

function Kpi({ label, value, tone, sub }: { label: string; value: string; tone?: "red" | "green" | "amber"; sub?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        tone === "red" && "border-destructive/40 bg-destructive/5",
        tone === "green" && "border-green-300 bg-green-50",
        tone === "amber" && "border-amber-300 bg-amber-50",
      )}
    >
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number | null)[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 py-2 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cn("px-3 py-1.5", j > 0 && "text-right tabular-nums")}>
                  {c === null ? "—" : typeof c === "number" ? c.toLocaleString("en-GB") : c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ items, max }: { items: { label: string; value: number; hint?: string }[]; max?: number }) {
  const top = Math.max(1, max ?? Math.max(...items.map((i) => i.value)));
  return (
    <div className="space-y-1">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-muted-foreground" title={i.hint ?? i.label}>
            {i.label}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(i.value / top) * 100}%` }} />
          </div>
          <span className="w-8 text-right tabular-nums">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

const statusLabel = (k: string) => TRANSPORT_STATUS_LABEL[k as TransportStatus] ?? k;
const typeLabel = (k: string) => TASK_TYPE_LABEL[k as TransportTaskType] ?? k;
const priorityLabel = (k: string) => PRIORITY_LABEL[k as TransportPriority] ?? k;

// --- Reports ----------------------------------------------------------------------

function Overview({ data, onTimeMinutes }: { data: TransportReports; onTimeMinutes: number }) {
  const o = data.overview;
  const days = o.daily.length > 62 ? weekly(o.daily) : o.daily.map((d) => ({ label: d.date.slice(5), value: d.requests, hint: `${d.date}: ${d.requests} requests, ${d.completed} completed` }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Requests" value={n(o.total)} />
        <Kpi label="Completed" value={n(o.completed)} tone="green" />
        <Kpi label="Completion" value={n(o.completionRate, "%")} tone={o.completionRate !== null && o.completionRate >= 90 ? "green" : undefined} />
        <Kpi label="No-shows" value={n(o.noShows)} tone={o.noShows > 0 ? "amber" : undefined} />
        <Kpi label="Cancelled" value={n(o.cancelled)} />
        <Kpi label="Open" value={n(o.open)} sub={o.overdue ? `${o.overdue} overdue` : undefined} tone={o.overdue > 0 ? "red" : undefined} />
        <Kpi label={`On time (≤${onTimeMinutes} min)`} value={n(o.onTimeRate, "%")} sub={o.avgStartDelayMin !== null ? `avg ${o.avgStartDelayMin > 0 ? "+" : ""}${o.avgStartDelayMin} min` : undefined} tone={o.onTimeRate !== null && o.onTimeRate < 70 ? "amber" : undefined} />
        <Kpi label="Rating" value={o.avgRating === null ? "—" : `${o.avgRating} / 5`} sub={`${o.ratings} rating${o.ratings === 1 ? "" : "s"}`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Passengers carried" value={n(o.passengers)} />
        <Kpi label="Shuttle runs" value={n(o.shuttleRuns)} />
        <Kpi label="Return trips" value={n(o.returnTrips)} />
      </div>
      <section className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Requests per {o.daily.length > 62 ? "week" : "day"}</p>
        <Bars items={days} />
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <section className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By status</p>
          <Bars items={o.byStatus.map((x) => ({ label: statusLabel(x.status), value: x.count }))} />
        </section>
        <section className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By task type</p>
          <Bars items={o.byTaskType.map((x) => ({ label: typeLabel(x.taskType), value: x.count }))} />
        </section>
        <section className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By priority</p>
          <Bars items={o.byPriority.map((x) => ({ label: priorityLabel(x.priority), value: x.count }))} />
        </section>
      </div>
    </div>
  );
}

function weekly(daily: TransportReports["overview"]["daily"]) {
  const out: { label: string; value: number; hint: string }[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    const total = chunk.reduce((s, d) => s + d.requests, 0);
    out.push({ label: `w/c ${chunk[0].date.slice(5)}`, value: total, hint: `${chunk[0].date} to ${chunk[chunk.length - 1].date}: ${total} requests` });
  }
  return out;
}

function Drivers({ data, onTimeMinutes }: { data: TransportReports; onTimeMinutes: number }) {
  const best = [...data.drivers].filter((d) => d.ratings >= 2).sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))[0];
  const late = [...data.drivers].filter((d) => d.started >= 3).sort((a, b) => (a.onTimeRate ?? 100) - (b.onTimeRate ?? 100))[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Drivers with tasks" value={n(data.drivers.length)} />
        <Kpi label="Best rated (2+ ratings)" value={best ? `${best.name}` : "—"} sub={best ? `${best.avgRating} / 5 over ${best.ratings}` : undefined} tone={best ? "green" : undefined} />
        <Kpi label="Least punctual (3+ starts)" value={late ? late.name : "—"} sub={late ? `${late.onTimeRate}% on time` : undefined} tone={late && (late.onTimeRate ?? 100) < 70 ? "amber" : undefined} />
      </div>
      <Table
        head={["Driver", "Tasks", "Completed", "No-shows", `On time ≤${onTimeMinutes}m`, "Avg delay", "Km", "Litres", "Fuel cost", "L/100", "Rating", "Days"]}
        rows={data.drivers.map((d) => [d.name, d.tasks, d.completed, d.noShows, d.onTimeRate === null ? null : `${d.onTimeRate}%`, d.avgStartDelayMin === null ? null : `${d.avgStartDelayMin} min`, d.km, d.litres, d.fuelCost, d.lPer100, d.avgRating === null ? null : `${d.avgRating} (${d.ratings})`, d.daysWorked])}
        empty="No driver had a task in the period."
      />
    </div>
  );
}

function Vehicles({ data }: { data: TransportReports }) {
  const km = data.vehicles.reduce((s, v) => s + v.km, 0);
  const litres = data.vehicles.reduce((s, v) => s + v.litres, 0);
  const cost = data.vehicles.reduce((s, v) => s + v.fuelCost, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Vehicles used" value={n(data.vehicles.length)} />
        <Kpi label="Kilometres" value={n(km)} />
        <Kpi label="Fuel (L)" value={n(Math.round(litres * 10) / 10)} />
        <Kpi label="Fuel cost" value={n(cost)} sub={km > 0 ? `${Math.round(cost / km)} per km` : undefined} />
      </div>
      <Table
        head={["Vehicle", "Tasks", "Completed", "Km", "Litres", "Fuel cost", "L/100 km", "Days used", "Last odometer"]}
        rows={data.vehicles.map((v) => [v.name, v.tasks, v.completed, v.km, v.litres, v.fuelCost, v.lPer100, v.daysUsed, v.lastOdometer])}
        empty="No vehicle was assigned in the period."
      />
      <p className="text-xs text-muted-foreground">Kilometres and fuel come from what drivers log on completing a trip; a trip with no log counts as zero.</p>
    </div>
  );
}

function Requesters({ data }: { data: TransportReports }) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">By department</h3>
        <Table
          head={["Department", "Requests", "Completed", "Cancelled", "No-shows", "Passengers", "People"]}
          rows={data.departments.map((d) => [d.department, d.requests, d.completed, d.cancelled, d.noShows, d.passengers, d.people])}
          empty="No requests in the period."
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">By person</h3>
        <Table
          head={["Requester", "Department", "Requests", "Completed", "Cancelled", "No-shows", "Passengers"]}
          rows={data.requesters.map((p) => [p.name, p.department ?? "—", p.requests, p.completed, p.cancelled, p.noShows, p.passengers])}
          empty="No requests in the period."
        />
      </section>
    </div>
  );
}

function Routes({ data }: { data: TransportReports }) {
  return (
    <Table
      head={["Pickup", "Drop-off", "Trips", "Completed", "Passengers", "Avg pax", "Mostly", "Avg km"]}
      rows={data.routes.map((r) => [r.pickup, r.dropoff, r.trips, r.completed, r.passengers, r.avgPassengers, typeLabel(r.mainType), r.avgKm])}
      empty="No trips in the period."
    />
  );
}

function Peaks({ data }: { data: TransportReports }) {
  const p = data.peaks;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="Busiest weekday" value={p.busiestWeekday === null ? "—" : DAY_LABELS[p.busiestWeekday]} sub={p.busiestWeekday === null ? undefined : `${p.byWeekday[p.busiestWeekday]} departures`} />
        <Kpi label="Busiest hour" value={p.busiestHour === null ? "—" : `${String(p.busiestHour).padStart(2, "0")}:00`} sub={p.busiestHour === null ? undefined : `${p.byHour[p.busiestHour]} departures`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Departures by weekday</p>
          <Bars items={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ label: DAY_LABELS[d], value: p.byWeekday[d] }))} />
        </section>
        <section className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Departures by hour (site time)</p>
          <Bars items={p.byHour.map((v, h) => ({ label: `${String(h).padStart(2, "0")}:00`, value: v })).filter((x, h) => x.value > 0 || (h >= 5 && h <= 21))} />
        </section>
      </div>
    </div>
  );
}

function Shuttles({ data }: { data: TransportReports }) {
  const booked = data.shuttles.reduce((s, x) => s + x.seatsBooked, 0);
  const offered = data.shuttles.reduce((s, x) => s + x.seatsOffered, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Shuttles that ran" value={n(data.shuttles.length)} />
        <Kpi label="Runs" value={n(data.shuttles.reduce((s, x) => s + x.runs, 0))} />
        <Kpi label="Seats booked" value={n(booked)} sub={offered ? `of ${offered} offered` : undefined} />
        <Kpi label="Occupancy" value={offered ? `${Math.round((booked / offered) * 100)}%` : "—"} tone={offered && booked / offered < 0.3 ? "amber" : undefined} />
      </div>
      <Table
        head={["Shuttle", "Route", "Seats", "Runs", "Completed", "Booked", "Offered", "Occupancy", "Empty runs"]}
        rows={data.shuttles.map((x) => [x.name, x.route, x.capacity, x.runs, x.completedRuns, x.seatsBooked, x.seatsOffered, x.occupancy === null ? null : `${x.occupancy}%`, x.emptyRuns])}
        empty="No shuttle ran in the period."
      />
      <p className="text-xs text-muted-foreground">Booked seats count people who took a seat on the run; walk-ons are not counted. A run with low occupancy for weeks is a candidate for a smaller vehicle or a merged schedule.</p>
    </div>
  );
}

function Approvals({ data }: { data: TransportReports }) {
  const a = data.approvals;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Kpi label="Approved in period" value={n(a.approved)} />
      <Kpi label="Waiting now" value={n(a.waiting)} tone={a.waiting > 0 ? "amber" : undefined} />
      <Kpi label="Avg decision time" value={a.avgDecisionHours === null ? "—" : `${a.avgDecisionHours} h`} />
      <Kpi label="Longest wait" value={a.maxDecisionHours === null ? "—" : `${a.maxDecisionHours} h`} tone={a.maxDecisionHours !== null && a.maxDecisionHours > 24 ? "amber" : undefined} />
    </div>
  );
}

// --- CSV -----------------------------------------------------------------------------

function csvFor(report: ReportKey, d: TransportReports): { table: string[][]; filename: string } {
  const filename = `transport-${report}-${d.from}_${d.to}.csv`;
  switch (report) {
    case "overview":
      return {
        filename,
        table: [["Date", "Requests", "Completed", "Cancelled", "No-shows"], ...d.overview.daily.map((x) => [x.date, s(x.requests), s(x.completed), s(x.cancelled), s(x.noShows)])],
      };
    case "drivers":
      return {
        filename,
        table: [
          ["Driver", "Tasks", "Completed", "No-shows", "Started", "On time", "On-time %", "Avg delay min", "Km", "Litres", "Fuel cost", "L/100", "Ratings", "Avg rating", "Days"],
          ...d.drivers.map((x) => [x.name, s(x.tasks), s(x.completed), s(x.noShows), s(x.started), s(x.onTime), s(x.onTimeRate), s(x.avgStartDelayMin), s(x.km), s(x.litres), s(x.fuelCost), s(x.lPer100), s(x.ratings), s(x.avgRating), s(x.daysWorked)]),
        ],
      };
    case "vehicles":
      return {
        filename,
        table: [["Vehicle", "Tasks", "Completed", "Km", "Litres", "Fuel cost", "L/100", "Days used", "Last odometer"], ...d.vehicles.map((x) => [x.name, s(x.tasks), s(x.completed), s(x.km), s(x.litres), s(x.fuelCost), s(x.lPer100), s(x.daysUsed), s(x.lastOdometer)])],
      };
    case "requesters":
      return {
        filename,
        table: [
          ["Section", "Name", "Department", "Requests", "Completed", "Cancelled", "No-shows", "Passengers"],
          ...d.departments.map((x) => ["Department", x.department, "", s(x.requests), s(x.completed), s(x.cancelled), s(x.noShows), s(x.passengers)]),
          ...d.requesters.map((x) => ["Person", x.name, x.department ?? "", s(x.requests), s(x.completed), s(x.cancelled), s(x.noShows), s(x.passengers)]),
        ],
      };
    case "routes":
      return {
        filename,
        table: [["Pickup", "Drop-off", "Trips", "Completed", "Passengers", "Avg pax", "Main type", "Avg km"], ...d.routes.map((x) => [x.pickup, x.dropoff, s(x.trips), s(x.completed), s(x.passengers), s(x.avgPassengers), x.mainType, s(x.avgKm)])],
      };
    case "peaks":
      return {
        filename,
        table: [["Kind", "Slot", "Departures"], ...d.peaks.byWeekday.map((v, i) => ["Weekday", DAY_LABELS[i], s(v)]), ...d.peaks.byHour.map((v, h) => ["Hour", `${String(h).padStart(2, "0")}:00`, s(v)])],
      };
    case "shuttles":
      return {
        filename,
        table: [["Shuttle", "Route", "Seats", "Runs", "Completed", "Booked", "Offered", "Occupancy %", "Empty runs"], ...d.shuttles.map((x) => [x.name, x.route, s(x.capacity), s(x.runs), s(x.completedRuns), s(x.seatsBooked), s(x.seatsOffered), s(x.occupancy), s(x.emptyRuns)])],
      };
    case "approvals":
      return {
        filename,
        table: [
          ["Metric", "Value"],
          ["Approved in period", s(d.approvals.approved)],
          ["Waiting now", s(d.approvals.waiting)],
          ["Avg decision hours", s(d.approvals.avgDecisionHours)],
          ["Longest wait hours", s(d.approvals.maxDecisionHours)],
        ],
      };
  }
}
