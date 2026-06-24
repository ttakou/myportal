import { BarChart3, CalendarX, DollarSign, ShieldCheck, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_STATUS_LABEL, type PlanStatus } from "@/types/training";
import type {
  ComplianceReport,
  CostReport,
  EffectivenessReport,
  ExpiringRow,
  PlanProgressReport,
} from "@/lib/training";

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">{icon} {title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full", pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-destructive")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const fmtCur = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export function ComplianceReportPanel({ data }: { data: ComplianceReport }) {
  return (
    <Section icon={<ShieldCheck className="h-5 w-5 text-primary" />} title="Statutory Compliance" subtitle="Required vs compliant across active staff, per course.">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
        <p className="text-3xl font-semibold tabular-nums">{data.overall.rate}%</p>
        <div className="text-sm text-muted-foreground">
          {data.overall.compliant} compliant of {data.overall.required} required course-assignments
        </div>
      </div>
      {data.byCourse.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No statutory courses defined yet.</p>
      ) : (
        <Table head={["Course", "Compliant", "Expiring", "Expired", "Not done", "Rate"]}>
          {data.byCourse.map((c) => (
            <tr key={c.title} className="border-t">
              <td className="px-4 py-2 font-medium">{c.title}</td>
              <td className="px-4 py-2 tabular-nums">{c.compliant}/{c.required}</td>
              <td className="px-4 py-2 tabular-nums text-amber-700">{c.expiring || "—"}</td>
              <td className="px-4 py-2 tabular-nums text-destructive">{c.expired || "—"}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{c.missing || "—"}</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <Bar pct={c.rate} />
                  <span className="tabular-nums text-xs">{c.rate}%</span>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function ExpiringReportPanel({ rows }: { rows: ExpiringRow[] }) {
  return (
    <Section icon={<CalendarX className="h-5 w-5 text-primary" />} title="Expiring Certifications" subtitle="Certificates already expired or expiring within 90 days.">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing expiring soon.</p>
      ) : (
        <Table head={["Employee", "Course", "Expires", "In"]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-2 font-medium">{r.person}</td>
              <td className="px-4 py-2">{r.course_title}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.expires_on}</td>
              <td className="px-4 py-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.expired ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700")}>
                  {r.expired ? `${Math.abs(r.days)}d ago` : `${r.days}d`}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function CostReportPanel({ data }: { data: CostReport }) {
  return (
    <Section icon={<DollarSign className="h-5 w-5 text-primary" />} title="Training Costs" subtitle="Cost of scheduled (non-cancelled) sessions, by course.">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Total scheduled cost</p>
        <p className="text-3xl font-semibold tabular-nums">{fmtCur(data.total)}</p>
      </div>
      {data.byCourse.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No sessions with costs yet.</p>
      ) : (
        <Table head={["Course", "Sessions", "Cost"]}>
          {data.byCourse.map((c) => (
            <tr key={c.title} className="border-t">
              <td className="px-4 py-2 font-medium">{c.title}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{c.sessions}</td>
              <td className="px-4 py-2 tabular-nums">{fmtCur(c.cost)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function PlanProgressReportPanel({ data }: { data: PlanProgressReport }) {
  return (
    <Section icon={<TrendingUp className="h-5 w-5 text-primary" />} title="Training Plan Progress" subtitle={`${data.total} plan item(s) across the organisation.`}>
      {data.total === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No plan items yet.</p>
      ) : (
        <Table head={["Status", "Items", "Share"]}>
          {data.byStatus.map((s) => {
            const pct = Math.round((s.count / data.total) * 100);
            return (
              <tr key={s.status} className="border-t">
                <td className="px-4 py-2 font-medium">{PLAN_STATUS_LABEL[s.status as PlanStatus] ?? s.status}</td>
                <td className="px-4 py-2 tabular-nums">{s.count}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Bar pct={pct} />
                    <span className="tabular-nums text-xs">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Section>
  );
}

const KIRK_LABEL: Record<string, string> = {
  reaction: "Reaction",
  learning: "Learning",
  behaviour: "Behaviour",
  results: "Results",
};

export function EffectivenessReportPanel({ data }: { data: EffectivenessReport }) {
  return (
    <Section icon={<BarChart3 className="h-5 w-5 text-primary" />} title="Training Effectiveness" subtitle="Average evaluation scores (Kirkpatrick levels).">
      {data.total === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No evaluations recorded yet. Capturing evaluations is part of HR Administration (coming up).
        </p>
      ) : (
        <Table head={["Level", "Avg score", "Responses"]}>
          {data.byKind.map((k) => (
            <tr key={k.kind} className="border-t">
              <td className="px-4 py-2 font-medium">{KIRK_LABEL[k.kind] ?? k.kind}</td>
              <td className="px-4 py-2 tabular-nums">{k.avg ?? "—"}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{k.count}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}
