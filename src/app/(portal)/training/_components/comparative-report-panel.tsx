import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodTrainingStats } from "@/lib/training";
import { PrintButton } from "../../reports/_components/print-button";
import { ReportHeader } from "../../reports/_components/report-header";
import { ReportStampFooter } from "../../reports/_components/report-stamp-footer";

function n(x: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(x);
}

/** Signed delta chip: green up, red down, neutral flat. */
function Delta({ a, b }: { a: number; b: number }) {
  const diff = a - b;
  if (diff === 0 || (a === 0 && b === 0)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const pct = b !== 0 ? Math.round((diff / b) * 100) : null;
  const up = diff > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-green-700" : "text-destructive")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {n(Math.abs(diff))}
      {pct != null && ` (${up ? "+" : "−"}${Math.abs(pct)}%)`}
    </span>
  );
}

/**
 * Rapport comparatif — the same activity metrics for two periods side by side
 * with deltas: period A (current) vs period B (reference). Quick presets link
 * common comparisons; any custom pair can be set via the URL.
 */
export function ComparativeReportPanel({
  a,
  b,
  currency,
}: {
  a: PeriodTrainingStats;
  b: PeriodTrainingStats;
  currency: string;
}) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3); // 0-based quarter
  const qStart = (yy: number, qq: number) => `${yy}-${String(qq * 3 + 1).padStart(2, "0")}-01`;
  const qEnd = (yy: number, qq: number) =>
    new Date(Date.UTC(yy, qq * 3 + 3, 0)).toISOString().slice(0, 10);
  const prevQ = q === 0 ? { y: y - 1, q: 3 } : { y, q: q - 1 };
  const presets = [
    { label: `${y} vs ${y - 1}`, from: `${y}-01-01`, to: `${y}-12-31`, fromB: `${y - 1}-01-01`, toB: `${y - 1}-12-31` },
    { label: "This quarter vs previous", from: qStart(y, q), to: qEnd(y, q), fromB: qStart(prevQ.y, prevQ.q), toB: qEnd(prevQ.y, prevQ.q) },
  ];

  const metrics: { label: string; get: (s: PeriodTrainingStats) => number; money?: boolean }[] = [
    { label: "Sessions", get: (s) => s.sessions },
    { label: "Completed sessions", get: (s) => s.completedSessions },
    { label: "People trained", get: (s) => s.peopleTrained },
    { label: "Person-hours", get: (s) => s.hours },
    { label: `Cost (${currency})`, get: (s) => s.cost, money: true },
    { label: "Completions recorded", get: (s) => s.completions },
  ];

  // Per-course people, joined over both periods.
  const titles = [...new Set([...a.byCourse.map((c) => c.title), ...b.byCourse.map((c) => c.title)])];
  const courseRows = titles
    .map((title) => ({
      title,
      a: a.byCourse.find((c) => c.title === title)?.people ?? 0,
      b: b.byCourse.find((c) => c.title === title)?.people ?? 0,
    }))
    .sort((x, z) => z.a + z.b - (x.a + x.b));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">Compare:</span>
          {presets.map((p) => (
            <Link
              key={p.label}
              href={`/training?view=rpt-compare&from=${p.from}&to=${p.to}&fromB=${p.fromB}&toB=${p.toB}`}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent",
                a.from === p.from && a.to === p.to && b.from === p.fromB && "border-primary bg-primary/10 text-primary",
              )}
            >
              {p.label}
            </Link>
          ))}
          <span className="text-xs text-muted-foreground">
            (or set from/to/fromB/toB in the URL for a custom pair)
          </span>
        </div>
        <PrintButton />
      </div>

      <div className="hidden print:block">
        <ReportHeader
          title="Comparative Training Report"
          subtitle={`Period A ${a.from} → ${a.to} vs Period B ${b.from} → ${b.to}`}
        />
      </div>

      <section className="rounded-lg border bg-card p-4 break-inside-avoid">
        <h2 className="mb-2 text-sm font-semibold">Key metrics</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Metric</th>
              <th className="py-1.5 text-right font-medium">A · {a.from} → {a.to}</th>
              <th className="py-1.5 text-right font-medium">B · {b.from} → {b.to}</th>
              <th className="py-1.5 pl-6 font-medium">Δ (A vs B)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {metrics.map((m) => (
              <tr key={m.label}>
                <td className="py-1.5 font-medium">{m.label}</td>
                <td className="py-1.5 text-right tabular-nums">{n(m.get(a))}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{n(m.get(b))}</td>
                <td className="py-1.5 pl-6"><Delta a={m.get(a)} b={m.get(b)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border bg-card p-4 break-inside-avoid">
        <h2 className="mb-2 text-sm font-semibold">People trained, by course</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Course</th>
              <th className="py-1.5 text-right font-medium">Period A</th>
              <th className="py-1.5 text-right font-medium">Period B</th>
              <th className="py-1.5 pl-6 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {courseRows.map((c) => (
              <tr key={c.title}>
                <td className="py-1.5">{c.title}</td>
                <td className="py-1.5 text-right tabular-nums">{c.a}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{c.b}</td>
                <td className="py-1.5 pl-6"><Delta a={c.a} b={c.b} /></td>
              </tr>
            ))}
            {courseRows.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No sessions in either period.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="hidden print:block">
        <ReportStampFooter label="Comparative Report" />
      </div>
    </div>
  );
}
