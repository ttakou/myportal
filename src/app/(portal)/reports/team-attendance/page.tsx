import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { getAccess, getCachedUser } from "@/lib/auth";
import { today as siteToday } from "@/lib/canteen";
import { siteClock } from "@/lib/visitors/daily";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { getLine, getManagers, getTeamAttendance, type TeamAttendanceRow } from "@/lib/team-attendance";
import {
  clampPeriod,
  DAY_STATUS_LABEL,
  minutesClock,
  type DayStatus,
  type MemberDay,
} from "@/lib/team-attendance-format";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";
import { TeamScopeFilter } from "./team-scope-filter";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_TONE: Record<DayStatus, string> = {
  on_site: "bg-green-100 text-green-800",
  present: "bg-green-50 text-green-700",
  absent: "bg-amber-100 text-amber-800",
  weekend: "bg-muted text-muted-foreground",
  offshore: "bg-sky-100 text-sky-800",
  field_break: "bg-slate-100 text-slate-700",
};

function flags(d: MemberDay): string {
  return [d.late && "Late", d.leftEarly && "Left early"].filter(Boolean).join(" · ");
}

export default async function TeamAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string; user?: string; scope?: string; manager?: string }>;
}) {
  const sp = await searchParams;
  const [access, me] = await Promise.all([getAccess(), getCachedUser()]);
  const today = siteToday();
  const { from, to } = clampPeriod(
    sp.from && ISO.test(sp.from) ? sp.from : today,
    sp.to && ISO.test(sp.to) ? sp.to : today,
    today,
  );

  // Administrators may read anybody's line; everybody else reads their own.
  // The database enforces the same rule, this only decides what to offer.
  const managerId = access.isAdmin && sp.manager ? sp.manager : null;
  const [line, managers] = await Promise.all([getLine(managerId), access.isAdmin ? getManagers() : Promise.resolve(null)]);
  const managerName = managerId ? managers?.find((m) => m.id === managerId)?.name ?? null : null;

  const scoped = line.filter(
    (m) =>
      (sp.scope !== "direct" || m.depth === 1) &&
      (!sp.department || m.department === sp.department) &&
      (!sp.user || m.profileId === sp.user),
  );
  const { rows, hours } = await getTeamAttendance({ members: scoped, from, to, today });

  const singleDay = from === to;
  const departments = [...new Set(line.map((m) => m.department).filter((d): d is string => !!d))].sort();
  const people = line.map((m) => ({ id: m.profileId, name: m.name })).sort((a, b) => a.name.localeCompare(b.name));

  const allDays = rows.flatMap((r) => r.days);
  const count = (s: DayStatus) => allDays.filter((d) => d.status === s).length;
  const present = count("present") + count("on_site");
  const absent = count("absent");
  const expected = present + absent;
  const late = allDays.filter((d) => d.late).length;
  const leftEarly = allDays.filter((d) => d.leftEarly).length;
  const rotation = count("offshore") + count("field_break");

  const csv: string[][] = [
    ["Date", "Name", "Job title", "Department", "Reports to", "Level", "Status", "Check-in", "Check-out", "Late", "Left early"],
    ...rows.flatMap((r) =>
      r.days.map((d) => [
        d.date,
        r.member.name,
        r.member.jobTitle ?? "",
        r.member.department ?? "",
        r.member.managerName ?? "",
        r.member.depth === 1 ? "Direct" : `Level ${r.member.depth}`,
        DAY_STATUS_LABEL[d.status],
        d.checkIn ? siteClock(d.checkIn) : "",
        d.checkOut ? siteClock(d.checkOut) : "",
        d.late ? "Yes" : "",
        d.leftEarly ? "Yes" : "",
      ]),
    ),
  ];

  const meta = [
    `Period: ${from}${singleDay ? "" : ` → ${to}`}`,
    managerName ? `Line of ${managerName}` : me ? "Your line" : "",
    sp.scope === "direct" ? "Direct reports only" : "Everyone below",
    sp.department ? `Department: ${sp.department}` : "All departments",
    `Working day ${minutesClock(hours.start)}–${minutesClock(hours.end)} site time`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <CsvExportButton filename={`team-attendance-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Team attendance"
        subtitle="Check-ins and check-outs of everyone below you in the reporting line. Rotational offshore staff follow their crew's rotation, so their days offshore or on break are not absences."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters
          show={{ period: true, department: true, user: true }}
          departments={departments}
          users={people}
          from={from}
          to={to}
        >
          <TeamScopeFilter managers={managers} />
        </ReportFilters>
      </div>

      {line.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8" />
          {managerId ? "Nobody reports to this person in the portal." : "Nobody reports to you in the portal yet."} Reporting lines are set on each
          person&apos;s profile (&ldquo;Reports to&rdquo;) by an administrator.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="People" value={String(rows.length)} />
            <Kpi label={singleDay ? "Came in" : "Days present"} value={String(present)} tone="green" />
            <Kpi label={singleDay ? "Not in" : "Days absent"} value={String(absent)} tone={absent ? "amber" : undefined} />
            <Kpi label="Attendance" value={expected ? `${Math.round((present / expected) * 100)}%` : "—"} />
            <Kpi label="Late arrivals" value={String(late)} tone={late ? "amber" : undefined} />
            <Kpi label={singleDay ? "On rotation" : "Rotation days"} value={String(rotation)} />
          </div>
          {leftEarly > 0 && (
            <p className="text-sm text-muted-foreground">
              {leftEarly} early departure{leftEarly === 1 ? "" : "s"} (before {minutesClock(hours.end)}).
            </p>
          )}

          {singleDay ? <DayTable rows={rows} /> : <PeriodTable rows={rows} />}
        </>
      )}
    </div>
  );
}

function Person({ r }: { r: TeamAttendanceRow }) {
  return (
    <td className="px-3 py-1.5">
      <span className="font-medium">{r.member.name}</span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">
        {[r.member.jobTitle, r.member.department].filter(Boolean).join(" · ") || "—"}
      </span>
    </td>
  );
}

function ReportsTo({ r }: { r: TeamAttendanceRow }) {
  return (
    <td className="px-3 py-1.5 text-muted-foreground">
      {r.member.managerName ?? "—"}
      {r.member.depth > 1 && <span className="ml-1 text-[11px]">(level {r.member.depth})</span>}
    </td>
  );
}

function DayTable({ rows }: { rows: TeamAttendanceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Reports to</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">In</th>
            <th className="px-3 py-2 text-right font-medium">Out</th>
            <th className="px-3 py-2 font-medium">Flags</th>
          </tr>
        </thead>
        <ProgressiveTableBody colSpan={6} className="divide-y" label="Show more people">
          {rows.map((r) => {
            const d = r.days[0];
            return (
              <tr key={r.member.profileId}>
                <Person r={r} />
                <ReportsTo r={r} />
                <td className="px-3 py-1.5">
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_TONE[d.status])}>
                    {DAY_STATUS_LABEL[d.status]}
                  </span>
                  {r.member.crew && (d.status === "offshore" || d.status === "field_break") && (
                    <span className="ml-1 text-[11px] text-muted-foreground">{r.member.crew}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{siteClock(d.checkIn)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{siteClock(d.checkOut)}</td>
                <td className="px-3 py-1.5 text-amber-700">{flags(d) || ""}</td>
              </tr>
            );
          })}
        </ProgressiveTableBody>
      </table>
    </div>
  );
}

function PeriodTable({ rows }: { rows: TeamAttendanceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Reports to</th>
            <th className="px-3 py-2 text-right font-medium">Present</th>
            <th className="px-3 py-2 text-right font-medium">Absent</th>
            <th className="px-3 py-2 text-right font-medium">Late</th>
            <th className="px-3 py-2 text-right font-medium">Left early</th>
            <th className="px-3 py-2 text-right font-medium">Rotation</th>
            <th className="px-3 py-2 text-right font-medium">Avg arrival</th>
          </tr>
        </thead>
        <ProgressiveTableBody colSpan={8} className="divide-y" label="Show more people">
          {rows.map((r) => (
            <tr key={r.member.profileId}>
              <Person r={r} />
              <ReportsTo r={r} />
              <td className="px-3 py-1.5 text-right tabular-nums">{r.summary.present}</td>
              <td className={cn("px-3 py-1.5 text-right tabular-nums", r.summary.absent > 0 && "text-amber-700")}>{r.summary.absent}</td>
              <td className={cn("px-3 py-1.5 text-right tabular-nums", r.summary.late > 0 && "text-amber-700")}>{r.summary.late}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.summary.leftEarly}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.summary.rotation || "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{minutesClock(r.summary.avgArrival)}</td>
            </tr>
          ))}
        </ProgressiveTableBody>
      </table>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "amber" && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
