import Link from "next/link";
import { getAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportHeader, ReportStampFooter } from "@/components/ui/report-letterhead";
import { siteToday } from "@/lib/offshore/manifest-order";
import { getMonthlyReport } from "@/lib/offshore/monthly-report-run";
import { canOpenMonthlyReport } from "@/lib/offshore/report-access";
import { tenantId } from "../(portal)/offshore/_actions/_shared";
import { PrintButton } from "../offshore-manifest/[id]/print-button";

/**
 * Monthly offshore report, printable for the monthly meeting: daily POB
 * against capacity, peak days, man-days and meals per company (recharging
 * contractors, checking the caterer's invoice), overstayers and late changes.
 * `?month=YYYY-MM`, this month by default.
 */

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";
const shift = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const access = await getAccess();
  if (!(await canOpenMonthlyReport(access))) {
    return <p className="p-8 text-sm text-muted-foreground">Not authorized to view this report.</p>;
  }
  const today = siteToday();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : today.slice(0, 7);
  const tenant = await tenantId();
  const admin = createAdminClient();
  if (!tenant || !admin) return <p className="p-8 text-sm text-muted-foreground">No organisation in scope.</p>;
  const r = await getMonthlyReport(admin, tenant, month, today);

  const capacity = r.installations.reduce((n, i) => n + i.capacity, 0);
  const scale = Math.max(capacity, r.totals.peak, 1);
  const inProgress = month === today.slice(0, 7);
  const th = "px-2 py-1 text-left font-semibold text-gray-600";
  const thr = "px-2 py-1 text-right font-semibold text-gray-600";
  const td = "px-2 py-1 align-top";
  const tdr = "px-2 py-1 text-right tabular-nums";

  return (
    <div className="bg-gray-100 p-6 print:bg-white print:p-0">
      <style>{`
        @media print { @page { size: A4 portrait; margin: 10mm; } }
        .mr, .mr * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>

      <div className="mx-auto mb-3 flex max-w-[900px] flex-wrap items-center gap-2 print:hidden">
        <Link href={`/offshore-monthly?month=${shift(month, -1)}`} className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
          ← {monthLabel(shift(month, -1))}
        </Link>
        {!inProgress && (
          <Link href={`/offshore-monthly?month=${shift(month, 1)}`} className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
            {monthLabel(shift(month, 1))} →
          </Link>
        )}
        <a href={`/offshore-export?type=monthly&month=${month}`} className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
          Export man-days (CSV)
        </a>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>

      <div className="mr mx-auto max-w-[900px] bg-white p-6 shadow-sm print:max-w-none print:shadow-none">
        <ReportHeader
          title={`Offshore monthly report — ${monthLabel(month)}`}
          subtitle={inProgress ? `Month to date, up to ${shortDate(today)}` : `${r.days.length} days`}
        />

        {/* Headline figures */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Man-days", r.totals.manDays.toLocaleString("en-GB")],
            ["Average POB", String(r.totals.average)],
            ["Peak POB", `${r.totals.peak}${r.totals.peakDate ? ` · ${shortDate(r.totals.peakDate)}` : ""}`],
            ["People on board", String(r.totals.people)],
            ["Days over capacity", String(r.installations.reduce((n, i) => n + i.daysOverCapacity, 0))],
          ].map(([k, v]) => (
            <div key={k} className="rounded border border-gray-200 p-2">
              <div className="text-lg font-bold text-gray-900">{v}</div>
              <div className="text-[11px] text-gray-500">{k}</div>
            </div>
          ))}
        </div>

        {/* Per installation */}
        <h2 className="mt-5 mb-1 text-sm font-bold text-gray-900">POB by installation</h2>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-50">
              <th className={th}>Installation</th>
              <th className={thr}>Capacity</th>
              <th className={thr}>Average</th>
              <th className={thr}>Lowest</th>
              <th className={thr}>Peak</th>
              <th className={th}>Peak day</th>
              <th className={thr}>Days over capacity</th>
            </tr>
          </thead>
          <tbody>
            {r.installations.map((i) => (
              <tr key={i.id} className="border-b border-gray-100">
                <td className={`${td} font-semibold`}>{i.name}</td>
                <td className={tdr}>{i.capacity || "—"}</td>
                <td className={tdr}>{i.average}</td>
                <td className={tdr}>{i.lowest}</td>
                <td className={`${tdr} font-semibold`}>{i.peak}</td>
                <td className={td}>{shortDate(i.peakDate)}</td>
                <td className={`${tdr} ${i.daysOverCapacity ? "font-semibold text-red-700" : ""}`}>{i.daysOverCapacity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Daily POB against capacity */}
        <h2 className="mt-5 mb-1 text-sm font-bold text-gray-900">
          Daily POB {capacity > 0 && <span className="font-normal text-gray-500">· capacity {capacity}</span>}
        </h2>
        <div className="space-y-px" style={{ breakInside: "avoid" }}>
          {r.days.map((d) => {
            const overCap = capacity > 0 && d.total > capacity;
            const isPeak = d.date === r.totals.peakDate;
            return (
              <div key={d.date} className="flex items-center gap-2 text-[10px]">
                <span className="w-12 shrink-0 text-gray-600">{dayLabel(d.date)}</span>
                <div className="relative h-3 flex-1 bg-gray-100">
                  <div
                    className={overCap ? "h-3 bg-red-500" : isPeak ? "h-3 bg-amber-500" : "h-3 bg-sky-600"}
                    style={{ width: `${Math.min(100, (d.total / scale) * 100)}%` }}
                  />
                  {capacity > 0 && (
                    <div className="absolute top-0 h-3 border-l-2 border-gray-800" style={{ left: `${(capacity / scale) * 100}%` }} />
                  )}
                </div>
                <span className={`w-8 shrink-0 text-right tabular-nums ${overCap ? "font-bold text-red-700" : ""}`}>{d.total}</span>
              </div>
            );
          })}
          {r.days.length === 0 && <p className="text-xs text-gray-400">No days to show yet.</p>}
        </div>

        {/* Man-days and meals per company */}
        <h2 className="mt-5 mb-1 text-sm font-bold text-gray-900">Man-days and meals per company</h2>
        <p className="mb-1 text-[10px] text-gray-500">
          Man-days: one per person per day on board (arrival day counts, departure day does not — as on the meal sheet).
          Meals: from the saved meal sheets, as ticked.
        </p>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-50">
              <th className={th}>Company</th>
              <th className={thr}>People</th>
              <th className={thr}>Man-days</th>
              <th className={thr}>Share</th>
              <th className={thr}>Breakfast</th>
              <th className={thr}>Snack</th>
              <th className={thr}>Lunch</th>
              <th className={thr}>Dinner</th>
              <th className={thr}>Lodging</th>
            </tr>
          </thead>
          <tbody>
            {r.companies.map((c) => (
              <tr key={c.company} className="border-b border-gray-100">
                <td className={`${td} font-semibold`}>{c.company}</td>
                <td className={tdr}>{c.people}</td>
                <td className={`${tdr} font-semibold`}>{c.manDays}</td>
                <td className={tdr}>{r.totals.manDays ? `${Math.round((c.manDays / r.totals.manDays) * 1000) / 10}%` : "—"}</td>
                <td className={tdr}>{c.meals.breakfast}</td>
                <td className={tdr}>{c.meals.snack}</td>
                <td className={tdr}>{c.meals.lunch}</td>
                <td className={tdr}>{c.meals.dinner}</td>
                <td className={tdr}>{c.meals.lodging}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 font-semibold">
              <td className={td}>Total</td>
              <td className={tdr}>{r.totals.people}</td>
              <td className={tdr}>{r.totals.manDays}</td>
              <td className={tdr}>100%</td>
              {(["breakfast", "snack", "lunch", "dinner", "lodging"] as const).map((k) => (
                <td key={k} className={tdr}>
                  {r.companies.reduce((n, c) => n + c.meals[k], 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* Overstayers */}
        <h2 className="mt-5 mb-1 text-sm font-bold text-gray-900">Overstayers · {r.overstayers.length}</h2>
        {r.overstayers.length === 0 ? (
          <p className="text-[11px] text-gray-500">Nobody stayed on board while their crew was scheduled ashore.</p>
        ) : (
          <table className="w-full border-collapse text-[11px]" style={{ breakInside: "avoid" }}>
            <thead>
              <tr className="border-y border-gray-300 bg-gray-50">
                <th className={th}>Name</th>
                <th className={th}>Company</th>
                <th className={thr}>Days overstayed</th>
                <th className={th}>From</th>
                <th className={th}>To</th>
              </tr>
            </thead>
            <tbody>
              {r.overstayers.map((o) => (
                <tr key={o.person} className="border-b border-gray-100">
                  <td className={`${td} font-semibold`}>{o.person}</td>
                  <td className={td}>{o.company ?? "—"}</td>
                  <td className={tdr}>{o.days}</td>
                  <td className={td}>{shortDate(o.from)}</td>
                  <td className={td}>{shortDate(o.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Late changes */}
        <h2 className="mt-5 mb-1 text-sm font-bold text-gray-900">Late changes · {r.lateChanges.length}</h2>
        <p className="mb-1 text-[10px] text-gray-500">
          Date changes approved this month, and trips cancelled within two days of their mobilise date.
        </p>
        {r.lateChanges.length === 0 ? (
          <p className="text-[11px] text-gray-500">None.</p>
        ) : (
          <table className="w-full border-collapse text-[11px]" style={{ breakInside: "avoid" }}>
            <thead>
              <tr className="border-y border-gray-300 bg-gray-50">
                <th className={th}>Decided</th>
                <th className={th}>Name</th>
                <th className={th}>Change</th>
              </tr>
            </thead>
            <tbody>
              {r.lateChanges.map((c, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className={td}>{shortDate(c.decided)}</td>
                  <td className={`${td} font-semibold`}>{c.person}</td>
                  <td className={td}>{c.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <ReportStampFooter label={`Offshore monthly report — ${monthLabel(month)}`} />
      </div>
    </div>
  );
}
