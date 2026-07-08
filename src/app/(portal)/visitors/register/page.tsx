import Link from "next/link";
import { AlertTriangle, ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { getAccessRegister, type AccessAnomaly, type AccessEntry } from "@/lib/access-register";
import { getDepartments } from "@/lib/visitors";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { ReportFilters } from "../../reports/_components/report-filters";
import { CsvExportButton } from "../../reports/_components/csv-export-button";
import { PrintButton } from "../../reports/_components/print-button";
import { ReportHeader } from "../../reports/_components/report-header";
import { ReportStampFooter } from "../../reports/_components/report-stamp-footer";
import { PopulationFilter } from "./_components/population-filter";
import { DailyTrafficChart } from "./_components/daily-traffic-chart";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
/** HH:MM (UTC) for an ISO timestamp, or "—". */
function clock(ts: string | null): string {
  return ts ? new Date(ts).toISOString().slice(11, 16) : "—";
}
function duration(e: AccessEntry): string {
  if (!e.check_in_at || !e.check_out_at) return "—";
  const mins = Math.max(0, Math.round((+new Date(e.check_out_at) - +new Date(e.check_in_at)) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${mins}m`;
}

const KIND_LABEL = { staff: "Staff", contractor: "Contractor", visitor: "Visitor" } as const;
const KIND_STYLE = {
  staff: "bg-primary/10 text-primary",
  contractor: "bg-amber-100 text-amber-800",
  visitor: "bg-sky-100 text-sky-800",
} as const;
const ANOMALY_LABEL: Record<AccessAnomaly["type"], string> = {
  after_hours: "After hours",
  no_exit: "No exit logged",
  overstay: "Pass overstay",
};
const POPULATIONS = new Set(["all", "staff", "contractor", "visitor"]);

function RegisterRow({
  e,
  drillFrom,
  drillTo,
}: {
  e: AccessEntry;
  /** One-year window the name drill-down links open with. */
  drillFrom: string;
  drillTo: string;
}) {
  // Click a name → that person's full access history (last 12 months).
  const drillHref = e.personId
    ? `/visitors/register?user=${e.personId}&from=${drillFrom}&to=${drillTo}`
    : `/visitors/register?visitorName=${encodeURIComponent(e.name)}&from=${drillFrom}&to=${drillTo}`;
  return (
    <tr className="border-t">
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.date}</td>
      <td className="px-3 py-2 font-medium">
        <Link href={drillHref} className="hover:underline print:no-underline">
          {e.name}
        </Link>
        {e.badge && (
          <span className="block text-xs font-normal text-muted-foreground">Badge {e.badge}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={cn(
            "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
            KIND_STYLE[e.kind],
          )}
        >
          {KIND_LABEL[e.kind]}
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {e.detail ?? "—"}
        {(e.check_in_comment || e.check_out_comment) && (
          <span className="mt-0.5 block text-[11px] italic text-muted-foreground/80">
            {[e.check_in_comment && `In: ${e.check_in_comment}`, e.check_out_comment && `Out: ${e.check_out_comment}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{e.vehicle ?? "—"}</td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{clock(e.check_in_at)}</td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">
        {e.check_in_at && !e.check_out_at ? (
          <span className="font-medium text-primary">on site</span>
        ) : (
          clock(e.check_out_at)
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{duration(e)}</td>
    </tr>
  );
}

export default async function AccessRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    population?: string;
    department?: string;
    user?: string;
    visitorName?: string;
  }>;
}) {
  // Same audience as the muster / throughput report: admins, security /
  // reception and emergency responders (visitors:operate).
  const [access, perms] = await Promise.all([getAccess(), getMyPermissions()]);
  const canView =
    access.isAdmin || access.isSystemAdmin || hasPermission(perms, "visitors", "operate");
  if (!canView) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">
          The access register is available to administrators, security and reception.
        </p>
        <Link href="/visitors" className="text-sm font-medium text-primary hover:underline">
          ← Back to visitors
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const now = new Date();
  const defFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1)); // this month
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : defFrom;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : iso(now);
  const population = (POPULATIONS.has(sp.population ?? "") ? sp.population : "all") as
    | "all"
    | "staff"
    | "contractor"
    | "visitor";
  const visitorName = sp.visitorName?.trim() || null;
  const drillFrom = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  const drillTo = iso(now);

  const supabase = createClient();
  const [register, departments, { data: people }] = await Promise.all([
    getAccessRegister({
      from,
      to,
      population,
      department: sp.department || null,
      personId: sp.user || null,
      visitorName,
    }),
    getDepartments(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name"),
  ]);
  const { entries, summary, dailyCounts, anomalies, truncated } = register;
  const users = ((people ?? []) as { id: string; full_name: string | null }[]).map((p) => ({
    id: p.id,
    name: p.full_name ?? "—",
  }));

  const filterMeta = [
    `${from} → ${to}`,
    population !== "all" ? KIND_LABEL[population] : null,
    sp.department || null,
    sp.user ? users.find((u) => u.id === sp.user)?.name ?? null : null,
    visitorName ? `Visitor: ${visitorName}` : null,
  ].filter((x): x is string => Boolean(x));

  const csv: string[][] = [
    ["Date", "Name", "Type", "Department/Company", "Detail", "Badge", "Vehicle", "In (UTC)", "Out (UTC)", "Duration", "Check-in comment", "Check-out comment"],
    ...entries.map((e) => [
      e.date,
      e.name,
      KIND_LABEL[e.kind],
      e.org ?? "",
      e.detail ?? "",
      e.badge ?? "",
      e.vehicle ?? "",
      clock(e.check_in_at),
      clock(e.check_out_at),
      duration(e),
      e.check_in_comment ?? "",
      e.check_out_comment ?? "",
    ]),
  ];

  const cards = [
    { label: "Entries", value: summary.total },
    { label: "People", value: summary.distinctPeople },
    { label: "Staff", value: summary.staff },
    { label: "Contractors", value: summary.contractors },
    { label: "Visitors", value: summary.visitors },
    { label: "No exit logged", value: summary.openExits },
  ];

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link
          href="/visitors"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Visitors
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Access register</h1>
            <p className="text-muted-foreground">
              Historical entry &amp; exit log — staff, contractors and visitors. Click a name for
              that person&apos;s history.
            </p>
          </div>
          <div className="flex gap-2">
            <CsvExportButton filename={`access-register_${from}_${to}.csv`} table={csv} />
            <PrintButton />
          </div>
        </div>
      </div>

      {visitorName && (
        <p className="rounded-lg border bg-card px-4 py-2 text-sm print:hidden">
          Showing history for visitor <strong>{visitorName}</strong>.{" "}
          <Link href="/visitors/register" className="font-medium text-primary hover:underline">
            Clear
          </Link>
        </p>
      )}

      <div className="print:hidden">
        <ReportFilters
          show={{ period: true, department: true, user: true }}
          departments={departments}
          users={users}
          from={from}
          to={to}
        >
          <PopulationFilter />
        </ReportFilters>
      </div>

      {truncated && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This period has more entries than can be shown at once — displaying the most recent
          5,000 per source. Narrow the date range for a complete view.
        </p>
      )}

      {/* Printed output opens with the shared branded letterhead. */}
      <div className="hidden print:block">
        <ReportHeader title="Access Register" subtitle="Site entry & exit log" meta={filterMeta} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <DailyTrafficChart days={dailyCounts} />

      {anomalies.length > 0 && (
        <section className="space-y-2 break-inside-avoid">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Anomalies ({anomalies.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <ProgressiveTableBody colSpan={4} label="Show more anomalies">
                {anomalies.map((a, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{a.date}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          a.type === "overstay"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-amber-100 text-amber-800",
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {ANOMALY_LABEL[a.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{a.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.detail}</td>
                  </tr>
                ))}
              </ProgressiveTableBody>
            </table>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Dept / Company</th>
              <th className="px-3 py-2.5 font-medium">Detail</th>
              <th className="px-3 py-2.5 font-medium">Vehicle</th>
              <th className="px-3 py-2.5 font-medium">In</th>
              <th className="px-3 py-2.5 font-medium">Out</th>
              <th className="px-3 py-2.5 font-medium">Duration</th>
            </tr>
          </thead>
          {/* Screen: progressive reveal for large periods. */}
          <ProgressiveTableBody colSpan={9} className="print:hidden" label="Show more entries">
            {entries.map((e, i) => (
              <RegisterRow key={i} e={e} drillFrom={drillFrom} drillTo={drillTo} />
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  No gate entries match the selected period and filters.
                </td>
              </tr>
            )}
          </ProgressiveTableBody>
          {/* Print/PDF: always the complete register, never truncated. */}
          <tbody className="hidden print:table-row-group">
            {entries.map((e, i) => (
              <RegisterRow key={i} e={e} drillFrom={drillFrom} drillTo={drillTo} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="hidden print:block">
        <ReportStampFooter label="Access Register" />
      </div>
    </div>
  );
}
