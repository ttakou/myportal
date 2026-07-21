import {
  AlertTriangle,
  CalendarClock,
  Clock,
  DollarSign,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrainingKpis } from "@/lib/training";
import { CsvExportButton } from "../../reports/_components/csv-export-button";
import { PrintButton } from "../../reports/_components/print-button";
import { ReportHeader } from "../../reports/_components/report-header";
import { ReportStampFooter } from "../../reports/_components/report-stamp-footer";
import { KpiPeriodPicker, type PeriodPreset } from "./kpi-period-picker";

/**
 * Management KPI dashboard for the Training module: an at-a-glance overview of
 * training delivery, statutory compliance, spend and per-department/course
 * activity across a chosen period, using a deliberately varied mix of chart
 * types (donut, bar trend, burn-down, ranking bars, meters, heatmap). Server
 * rendered; prints via the shared branded letterhead.
 */

function money(n: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} ${currency}`;
}
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
const monthShort = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });
const dateLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Mutually-exclusive compliance statuses — reserved status colours, never reused
// for a data series, always shown with a label (not colour alone).
const COMPLIANCE_KEYS = [
  { key: "valid", label: "Valid", stroke: "stroke-green-500", dot: "bg-green-500" },
  { key: "expiring", label: "Expiring soon", stroke: "stroke-amber-500", dot: "bg-amber-500" },
  { key: "expired", label: "Expired", stroke: "stroke-red-500", dot: "bg-red-500" },
  { key: "missing", label: "Never trained", stroke: "stroke-slate-300 dark:stroke-slate-600", dot: "bg-slate-300 dark:bg-slate-600" },
] as const;

/** Headline stat tile with tone-coded value. */
function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-green-600" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Compliance mix as a donut with a centred compliance rate. */
function ComplianceDonut({ mix }: { mix: TrainingKpis["compliance"] }) {
  const total = mix.valid + mix.expiring + mix.expired + mix.missing;
  const r = 44;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const segs = COMPLIANCE_KEYS.map((s) => {
    const v = mix[s.key];
    const len = total > 0 ? (v / total) * C : 0;
    const seg = { ...s, v, len, dash: offset };
    offset += len;
    return seg;
  });
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
      <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0" role="img" aria-label="Statutory compliance mix"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="15" className="stroke-muted" />
        {total > 0 &&
          segs.map((s) => (
            <circle
              key={s.key}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              strokeWidth="15"
              className={s.stroke}
              strokeDasharray={`${s.len} ${C - s.len}`}
              strokeDashoffset={-s.dash}
              transform="rotate(-90 60 60)"
            >
              <title>{`${s.label}: ${s.v}`}</title>
            </circle>
          ))}
        <text x="60" y="56" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="600">
          {mix.rate}%
        </text>
        <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground" fontSize="9">
          compliant
        </text>
      </svg>
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-1">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-sm", s.dot)} /> {s.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{s.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Monthly delivery trend — single-series vertical bars. */
function MonthlyTrend({ monthly }: { monthly: TrainingKpis["monthly"] }) {
  const max = Math.max(...monthly.map((m) => m.completions), 1);
  const n = monthly.length;
  const W = 960, H = 180, PAD = { top: 14, right: 8, bottom: 22, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(n, 1);
  const barW = Math.min(46, step - 8);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Completions per month"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.3} />
      {monthly.map((m, i) => {
        const x = PAD.left + i * step + (step - barW) / 2;
        const h = y(0) - y(m.completions);
        return (
          <g key={m.month}>
            <title>{`${monthShort(m.month)} ${m.month.slice(0, 4)} — ${m.completions} completion${m.completions === 1 ? "" : "s"}`}</title>
            {m.completions > 0 && <rect x={x} y={y(m.completions)} width={barW} height={Math.max(h, 1)} rx={3} className="fill-primary" />}
            {m.completions > 0 && m.completions >= max * 0.12 && (
              <text x={x + barW / 2} y={y(m.completions) - 4} textAnchor="middle" fontSize={9.5} fill="currentColor" fillOpacity={0.7}>
                {m.completions}
              </text>
            )}
            {(n <= 12 || i % 2 === 0) && (
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9.5} fill="currentColor" fillOpacity={0.55}>
                {monthShort(m.month)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Budget burn-down: cumulative committed spend vs the annual budget line. */
function BurnDown({ budget, currency }: { budget: TrainingKpis["budget"]; currency: string }) {
  const pts = budget.points;
  const lastSpend = pts.length ? pts[pts.length - 1].cumulative : 0;
  const max = Math.max(budget.total, lastSpend, 1);
  const W = 960, H = 200, PAD = { top: 16, right: 12, bottom: 24, left: 12 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (pts.length > 1 ? (i / (pts.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = pts.map((p, i) => `${x(i)},${y(p.cumulative)}`).join(" ");
  const area = `${PAD.left},${y(0)} ${line} ${x(pts.length - 1)},${y(0)}`;
  const budgetY = y(budget.total);
  const over = budget.total > 0 && lastSpend > budget.total;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-primary" /> Cumulative committed spend</span>
        {budget.total > 0 && (
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" /> Budget {budget.year}</span>
        )}
        <span className="ml-auto tabular-nums">
          {money(lastSpend, currency)}{budget.total > 0 ? ` / ${money(budget.total, currency)}` : ""}
          {over && <span className="ml-1 font-semibold text-destructive">over budget</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cumulative training spend versus budget"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.3} />
        <polygon points={area} className="fill-primary" fillOpacity={0.12} />
        <polyline points={line} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" />
        {budget.total > 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={budgetY} y2={budgetY} className={over ? "stroke-destructive" : "stroke-muted-foreground"} strokeWidth={1.5} strokeDasharray="5 4" />
        )}
        {pts.map((p, i) => (
          <g key={p.month}>
            <title>{`${monthShort(p.month)} ${p.month.slice(0, 4)} — ${money(p.cumulative, currency)} cumulative`}</title>
            <rect x={x(i) - innerW / pts.length / 2} y={PAD.top} width={innerW / pts.length} height={innerH} fill="transparent" />
            {i % 2 === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={9.5} fill="currentColor" fillOpacity={0.55}>{monthShort(p.month)}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Generic horizontal ranking bars (single hue). */
function HBars({ items, unit }: { items: { label: string; value: number; sub?: string }[]; unit: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No activity in this period.</p>;
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm">{it.label}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {it.value} {unit}{it.sub ? ` · ${it.sub}` : ""}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(it.value / max) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Per-course compliance meters, green/amber/red by rate. */
function ComplianceMeters({ courses }: { courses: TrainingKpis["courseCompliance"] }) {
  if (courses.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No statutory requirements defined.</p>;
  return (
    <ul className="space-y-2.5">
      {courses.map((c) => {
        const tone = c.rate >= 90 ? "bg-green-500" : c.rate >= 60 ? "bg-amber-500" : "bg-red-500";
        return (
          <li key={c.title} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{c.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.compliant}/{c.required}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(c.rate, 100)}%` }} />
              </div>
            </div>
            <span className="w-10 text-right text-sm font-medium tabular-nums">{c.rate}%</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Department × month completion intensity — sequential single-hue heatmap. */
function Heatmap({ data }: { data: TrainingKpis["heatmap"] }) {
  const { departments, months, cells } = data;
  if (departments.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No completions recorded in this period.</p>;
  let max = 1;
  for (const d of departments) for (const m of months) max = Math.max(max, cells[d]?.[m] ?? 0);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: "2px" }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card" />
            {months.map((m) => (
              <th key={m} className="px-1 pb-1 text-center text-[10px] font-medium text-muted-foreground">
                {monthShort(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {departments.map((d) => (
            <tr key={d}>
              <td className="sticky left-0 z-10 max-w-[9rem] truncate bg-card pr-2 text-xs text-muted-foreground" title={d}>{d}</td>
              {months.map((m) => {
                const v = cells[d]?.[m] ?? 0;
                const op = v === 0 ? 0 : 0.15 + 0.85 * (v / max);
                return (
                  <td key={m} className="p-0">
                    <div
                      title={`${d} — ${monthShort(m)} ${m.slice(0, 4)}: ${v} completion${v === 1 ? "" : "s"}`}
                      className="flex h-7 w-9 items-center justify-center rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: v === 0 ? "hsl(var(--muted))" : `hsl(var(--primary) / ${op})`,
                        color: op > 0.55 ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {v || ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </section>
  );
}

export function KpiDashboardPanel({ data }: { data: TrainingKpis }) {
  const k = data;

  // Period presets, computed relative to today (server-side).
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const y = now.getUTCFullYear();
  const todayStr = iso(now);
  const rolling = new Date(now);
  rolling.setUTCFullYear(rolling.getUTCFullYear() - 1);
  const presets: PeriodPreset[] = [
    { key: "ytd", label: "This year", from: `${y}-01-01`, to: todayStr },
    { key: "last", label: "Last year", from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
    { key: "rolling12", label: "Last 12 months", from: iso(rolling), to: todayStr },
  ];
  const activeKey = presets.find((p) => p.from === k.from && p.to === k.to)?.key ?? null;

  // CSV: headline KPIs + monthly trend + top courses in one export.
  const csv: string[][] = [
    ["Training KPIs", `${k.from} to ${k.to}`],
    [],
    ["Metric", "Value"],
    ["Statutory compliance rate", `${k.compliance.rate}%`],
    ["Required certifications", String(k.compliance.required)],
    ["Valid", String(k.compliance.valid)],
    ["Expiring soon", String(k.compliance.expiring)],
    ["Expired", String(k.compliance.expired)],
    ["Never trained", String(k.compliance.missing)],
    ["People trained (period)", String(k.peopleTrained)],
    ["Person-hours (period)", String(k.hours)],
    ["Completions (period)", String(k.completions)],
    ["Sessions (period)", String(k.sessions)],
    ["Training cost (period)", money(k.cost, k.currency)],
    ["Cost per person-hour", k.costPerHour == null ? "—" : money(k.costPerHour, k.currency)],
    ["Certificates expiring ≤90 days", String(k.expiringSoon)],
    ["Certificates expired", String(k.expiredCerts)],
    [],
    ["Month", "Completions"],
    ...k.monthly.map((m) => [m.month, String(m.completions)]),
    [],
    ["Course", "People trained", "Person-hours"],
    ...k.topCourses.map((c) => [c.title, String(c.people), String(c.hours)]),
  ];

  return (
    <div className="space-y-4">
      {/* Interactive header (screen only) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">Training KPIs</h2>
          <p className="text-sm text-muted-foreground">
            Management overview · {dateLabel(k.from)} – {dateLabel(k.to)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton filename={`training-kpis-${k.from}_${k.to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <KpiPeriodPicker presets={presets} activeKey={activeKey} from={k.from} to={k.to} />

      {/* Print masthead */}
      <div className="hidden print:block">
        <ReportHeader title="Training KPIs" subtitle={`${dateLabel(k.from)} – ${dateLabel(k.to)}`} />
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <Tile
          icon={ShieldCheck}
          label="Compliance"
          value={`${k.compliance.rate}%`}
          hint={`${k.compliance.valid}/${k.compliance.required} statutory certs valid`}
          tone={k.compliance.rate >= 90 ? "ok" : k.compliance.rate >= 60 ? "warn" : "danger"}
        />
        <Tile icon={Users} label="People trained" value={compact(k.peopleTrained)} hint="attended a session this period" />
        <Tile icon={Clock} label="Person-hours" value={compact(k.hours)} hint="training delivered" />
        <Tile icon={GraduationCap} label="Completions" value={compact(k.completions)} hint={`${k.sessions} sessions`} />
        <Tile icon={DollarSign} label="Training cost" value={money(k.cost, k.currency)} hint={k.costPerHour == null ? "—" : `${money(k.costPerHour, k.currency)}/person-hour`} />
        <Tile
          icon={CalendarClock}
          label="Expiring ≤90 days"
          value={compact(k.expiringSoon)}
          hint={`${k.expiredCerts} already expired`}
          tone={k.expiringSoon > 0 || k.expiredCerts > 0 ? "warn" : "ok"}
        />
        <Tile
          icon={AlertTriangle}
          label="Never trained"
          value={compact(k.compliance.missing)}
          hint="required but no record"
          tone={k.compliance.missing > 0 ? "danger" : "ok"}
        />
        <Tile icon={GraduationCap} label="Sessions completed" value={compact(k.completedSessions)} hint={`of ${k.sessions} held`} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Statutory compliance" subtitle="Required certifications across active staff (today)">
          <ComplianceDonut mix={k.compliance} />
        </Card>
        <Card title="Delivery trend" subtitle="Completions recorded per month" className="lg:col-span-2">
          <MonthlyTrend monthly={k.monthly} />
        </Card>
      </div>

      <Card title={`Budget burn-down ${k.budget.year}`} subtitle="Cumulative committed spend against the annual training budget">
        <BurnDown budget={k.budget} currency={k.currency} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top courses" subtitle="By people trained in the period">
          <HBars items={k.topCourses.map((c) => ({ label: c.title, value: c.people, sub: `${c.hours}h` }))} unit="people" />
        </Card>
        <Card title="By department" subtitle="People trained in the period">
          <HBars items={k.byDepartment.map((d) => ({ label: d.department, value: d.people, sub: `${d.completions} compl.` }))} unit="people" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Compliance by course" subtitle="Lowest first — where the gaps are">
          <ComplianceMeters courses={k.courseCompliance} />
        </Card>
        <Card title="Activity heatmap" subtitle="Completions by department × month">
          <Heatmap data={k.heatmap} />
        </Card>
      </div>

      <div className="hidden print:block">
        <ReportStampFooter label="Training KPIs" />
      </div>
    </div>
  );
}
