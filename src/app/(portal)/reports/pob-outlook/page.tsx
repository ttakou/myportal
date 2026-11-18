import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { siteDate } from "@/lib/visitors/daily";
import { cn } from "@/lib/utils";
import { getPobOutlook } from "@/lib/offshore/pob-outlook-data";
import type { OutlookDay } from "@/lib/offshore/pob-outlook";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 200;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

function weekday(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

export default async function PobOutlookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isOim || access.isCampboss || access.isDispatcher)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">The POB outlook is for the OIM, the Campboss, dispatchers and administrators.</p>
        <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const today = siteDate(new Date().toISOString());
  const from = sp.from && ISO.test(sp.from) ? sp.from : today;
  let to = sp.to && ISO.test(sp.to) ? sp.to : addDays(from, 29);
  if (to < from) to = from;
  if (to > addDays(from, MAX_DAYS - 1)) to = addDays(from, MAX_DAYS - 1);

  const outlook = await getPobOutlook(from, to);

  const csv: string[][] = [
    ["Installation", "Date", "POB", "Rotational crew", "Other (trips & visitors)", "Crew out (mob)", "Crew back (demob)", "Awaiting decision", "POB limit", "Over limit", "Over if all approved"],
    ...outlook.flatMap((o) =>
      o.days.map((d) => [
        o.installation.name,
        d.date,
        String(d.total),
        String(d.rotational),
        String(d.total - d.rotational),
        d.mob ? String(d.mob) : "",
        d.demob ? String(d.demob) : "",
        d.pending ? String(d.pending) : "",
        d.capacity ? String(d.capacity) : "",
        d.over ? "Yes" : "",
        d.overIfApproved && !d.over ? "Yes" : "",
      ]),
    ),
  ];

  const quick = [14, 30, 60, 90].map((n) => ({ n, href: `/reports/pob-outlook?from=${today}&to=${addDays(today, n - 1)}` }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          {(access.isOim || access.isCampboss) && (
            <Link href="/reports/offshore-approvals" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              Approvals log
            </Link>
          )}
          <CsvExportButton filename={`pob-outlook-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="POB outlook"
        subtitle="Expected people on board each day: rotational crews placed by their rotation schedule (a late or early traveller does not move it), plus approved staff trips and visitors. Crew-change days show who goes out and who comes back; requests awaiting a decision are shown apart."
        meta={[`${from} → ${to}`]}
      />

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <ReportFilters show={{ period: true }} from={from} to={to} />
        <div className="flex gap-1.5">
          {quick.map((q) => (
            <Link key={q.n} href={q.href} className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
              Next {q.n} days
            </Link>
          ))}
        </div>
      </div>

      {outlook.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No active installation.</p>
      )}

      {outlook.map((o) => {
        const overDays = o.days.filter((d) => d.over).length;
        const riskDays = o.days.filter((d) => d.overIfApproved && !d.over).length;
        const changes = o.days.filter((d) => d.mob || d.demob).length;
        const cap = o.installation.capacity;
        return (
          <section key={o.installation.id} className="space-y-3">
            <h2 className="text-lg font-semibold">{o.installation.name}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Kpi label="POB limit" value={cap ? String(cap) : "not set"} />
              <Kpi label="Peak POB" value={String(o.peak)} tone={cap && o.peak > cap ? "red" : undefined} />
              <Kpi label="Days over the limit" value={String(overDays)} tone={overDays ? "red" : "green"} />
              <Kpi label="Over if pending approved" value={String(riskDays)} tone={riskDays ? "amber" : undefined} />
              <Kpi label="Crew-change days" value={String(changes)} />
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">POB</th>
                    <th className="px-3 py-2 text-right font-medium">Rotational</th>
                    <th className="px-3 py-2 text-right font-medium">Trips &amp; visitors</th>
                    <th className="px-3 py-2 font-medium">Crew change</th>
                    <th className="px-3 py-2 text-right font-medium">Awaiting</th>
                    <th className="px-3 py-2 font-medium">Load</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {o.days.map((d) => (
                    <DayRow key={d.date} d={d} today={today} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayRow({ d, today }: { d: OutlookDay; today: string }) {
  const pct = d.capacity > 0 ? Math.min(100, Math.round((d.total / d.capacity) * 100)) : null;
  return (
    <tr className={cn((d.mob || d.demob) && "bg-sky-50/60", d.over && "bg-red-50", d.date === today && "font-medium")}>
      <td className="px-3 py-1.5 tabular-nums">
        {d.date} <span className="text-xs text-muted-foreground">{weekday(d.date)}</span>
        {d.date === today && <span className="ml-1 text-[11px] text-primary">today</span>}
      </td>
      <td className={cn("px-3 py-1.5 text-right tabular-nums font-semibold", d.over && "text-destructive")}>
        {d.total}
        {d.capacity ? <span className="font-normal text-muted-foreground"> / {d.capacity}</span> : null}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{d.rotational}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{d.total - d.rotational}</td>
      <td className="px-3 py-1.5 text-xs">
        {d.mob ? <span className="mr-2 text-sky-800">↑ {d.mob} out</span> : null}
        {d.demob ? <span className="text-slate-700">↓ {d.demob} back</span> : null}
      </td>
      <td className={cn("px-3 py-1.5 text-right tabular-nums", d.overIfApproved && !d.over ? "font-medium text-amber-800" : "text-muted-foreground")}>
        {d.pending ? `+${d.pending}` : ""}
      </td>
      <td className="px-3 py-1.5">
        {pct !== null ? (
          <div className="h-2 w-28 overflow-hidden rounded bg-muted">
            <div className={cn("h-full", d.over ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-green-500")} style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">no limit set</span>
        )}
      </td>
    </tr>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "green" && "border-green-300 bg-green-50",
        tone === "amber" && "border-amber-300 bg-amber-50",
        tone === "red" && "border-red-300 bg-red-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
