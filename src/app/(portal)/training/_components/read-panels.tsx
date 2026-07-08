import Link from "next/link";
import {
  Award,
  CalendarDays,
  CalendarClock,
  ClipboardList,
  FilePlus2,
  History,
  LayoutDashboard,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLAN_STATUS_LABEL,
  type Certificate,
  type EmployeeCompetency,
  type HistoryItem,
  type MandatoryItem,
  type PlanItem,
  type UpcomingSession,
} from "@/types/training";
import type { TeamPlanRow, TeamReport, TrainingDashboard } from "@/lib/training";

function fmtDate(d: string | null): string {
  return d ? new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
function fmtDateTime(d: string | null): string {
  return d ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

const MAND_STYLE: Record<MandatoryItem["status"], string> = {
  compliant: "bg-green-100 text-green-700",
  expiring: "bg-amber-100 text-amber-700",
  expired: "bg-destructive/10 text-destructive",
  missing: "bg-muted text-muted-foreground",
};
const MAND_LABEL: Record<MandatoryItem["status"], string> = {
  compliant: "Compliant",
  expiring: "Expiring soon",
  expired: "Expired",
  missing: "Not done",
};

export function MandatoryPanel({ items }: { items: MandatoryItem[] }) {
  const open = items.filter((i) => i.status !== "compliant").length;
  return (
    <Section
      icon={<ShieldAlert className="h-5 w-5 text-primary" />}
      title="Mandatory Training"
      subtitle={`${items.length} required course(s) · ${open} need attention`}
    >
      {items.length === 0 ? (
        <Empty>No mandatory training assigned to you.</Empty>
      ) : (
        <Table head={["Course", "Completed", "Expires", "Status"]}>
          {items.map((i) => (
            <tr key={i.course_id} className="border-t">
              <td className="px-4 py-2 font-medium">
                {i.title}
                {i.is_statutory && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">statutory</span>
                )}
              </td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(i.completed_on)}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(i.expires_on)}</td>
              <td className="px-4 py-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", MAND_STYLE[i.status])}>
                  {MAND_LABEL[i.status]}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

const CERT_STYLE: Record<Certificate["status"], string> = {
  valid: "bg-green-100 text-green-700",
  expiring: "bg-amber-100 text-amber-700",
  expired: "bg-destructive/10 text-destructive",
};

export function CertificatesPanel({ items }: { items: Certificate[] }) {
  return (
    <Section
      icon={<Award className="h-5 w-5 text-primary" />}
      title="Certificates"
      subtitle={`${items.length} certificate(s) on record`}
    >
      {items.length === 0 ? (
        <Empty>No certificates recorded yet.</Empty>
      ) : (
        <Table head={["Course", "Completed", "Expires", "Certificate #", "Status"]}>
          {items.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-2 font-medium">{c.course_title}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(c.completed_on)}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(c.expires_on)}</td>
              <td className="px-4 py-2 text-muted-foreground">
                {c.certificate_url ? (
                  <a href={c.certificate_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {c.certificate_no || "View"}
                  </a>
                ) : (
                  c.certificate_no || "—"
                )}
              </td>
              <td className="px-4 py-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CERT_STYLE[c.status])}>
                  {c.status === "valid" ? "Valid" : c.status === "expiring" ? "Expiring" : "Expired"}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function PlanPanel({ items }: { items: PlanItem[] }) {
  return (
    <Section
      icon={<ListChecks className="h-5 w-5 text-primary" />}
      title="My Training Plan"
      subtitle={`${items.length} planned item(s)`}
    >
      {items.length === 0 ? (
        <Empty>No planned training yet. Approved requests and assigned courses appear here.</Empty>
      ) : (
        <Table head={["Course", "Year", "Period", "Source", "Status"]}>
          {items.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="px-4 py-2 font-medium">{p.course_title ?? "—"}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{p.plan_year}</td>
              <td className="px-4 py-2 text-muted-foreground">{p.period ?? "—"}</td>
              <td className="px-4 py-2 capitalize text-muted-foreground">{p.source}</td>
              <td className="px-4 py-2 text-muted-foreground">{PLAN_STATUS_LABEL[p.status]}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function CalendarPanel({ items }: { items: UpcomingSession[] }) {
  return (
    <Section
      icon={<CalendarDays className="h-5 w-5 text-primary" />}
      title="Training Calendar"
      subtitle={`${items.length} session(s) you're enrolled in`}
    >
      {items.length === 0 ? (
        <Empty>You have no scheduled sessions.</Empty>
      ) : (
        <Table head={["Course", "Starts", "Ends", "Location", "Status"]}>
          {items.map((s) => (
            <tr key={s.participant_id} className="border-t">
              <td className="px-4 py-2 font-medium">{s.course_title}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDateTime(s.starts_at)}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDateTime(s.ends_at)}</td>
              <td className="px-4 py-2 text-muted-foreground">{s.location ?? "—"}</td>
              <td className="px-4 py-2 capitalize text-muted-foreground">{s.status.replace("_", " ")}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function TeamCompliancePanel({ reports }: { reports: TeamReport[] }) {
  return (
    <Section
      icon={<ShieldCheck className="h-5 w-5 text-primary" />}
      title="Team Compliance"
      subtitle={`${reports.length} direct report(s)`}
    >
      {reports.length === 0 ? (
        <Empty>You have no direct reports.</Empty>
      ) : (
        <Table head={["Member", "Department", "Compliant", "Issues"]}>
          {reports.map((r) => {
            const total = r.items.length;
            const ok = r.items.filter((i) => i.status === "compliant").length;
            const expired = r.items.filter((i) => i.status === "expired").length;
            const missing = r.items.filter((i) => i.status === "missing").length;
            const expiring = r.items.filter((i) => i.status === "expiring").length;
            return (
              <tr key={r.profile_id} className="border-t">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.department ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums">
                  <span className={cn(ok === total ? "text-green-700" : "text-foreground")}>{ok}</span>
                  <span className="text-muted-foreground">/{total}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1 text-xs">
                    {expired > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{expired} expired</span>}
                    {missing > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{missing} not done</span>}
                    {expiring > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{expiring} expiring</span>}
                    {expired + missing + expiring === 0 && <span className="text-green-700">All good</span>}
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

export function DeptNeedsPanel({ reports }: { reports: TeamReport[] }) {
  const byCourse = new Map<string, { needing: number; total: number }>();
  for (const r of reports) {
    for (const i of r.items) {
      const e = byCourse.get(i.title) ?? { needing: 0, total: 0 };
      e.total += 1;
      if (i.status !== "compliant") e.needing += 1;
      byCourse.set(i.title, e);
    }
  }
  const rows = [...byCourse.entries()]
    .map(([title, v]) => ({ title, ...v }))
    .filter((r) => r.needing > 0)
    .sort((a, b) => b.needing - a.needing);
  return (
    <Section
      icon={<Target className="h-5 w-5 text-primary" />}
      title="Department Training Needs"
      subtitle="Mandatory courses your team still needs (not done / expired / expiring)."
    >
      {rows.length === 0 ? (
        <Empty>No outstanding training needs across your team.</Empty>
      ) : (
        <Table head={["Course", "Team members needing it"]}>
          {rows.map((r) => (
            <tr key={r.title} className="border-t">
              <td className="px-4 py-2 font-medium">{r.title}</td>
              <td className="px-4 py-2 tabular-nums">
                <span className="font-semibold text-amber-700">{r.needing}</span>
                <span className="text-muted-foreground"> / {r.total} required</span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function TeamPlanPanel({ rows }: { rows: TeamPlanRow[] }) {
  return (
    <Section
      icon={<ClipboardList className="h-5 w-5 text-primary" />}
      title="Team Training Plan"
      subtitle={`${rows.length} planned item(s) across your team`}
    >
      {rows.length === 0 ? (
        <Empty>No planned training for your team yet.</Empty>
      ) : (
        <Table head={["Member", "Course", "Year", "Period", "Status"]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-2 font-medium">{r.member}</td>
              <td className="px-4 py-2">{r.course_title ?? "—"}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.plan_year}</td>
              <td className="px-4 py-2 text-muted-foreground">{r.period ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{PLAN_STATUS_LABEL[r.status]}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function MyCompetenciesPanel({ items }: { items: EmployeeCompetency[] }) {
  return (
    <Section
      icon={<Sparkles className="h-5 w-5 text-primary" />}
      title="My Competencies"
      subtitle={`${items.filter((i) => i.current_level > 0).length} of ${items.length} competencies assessed`}
    >
      {items.length === 0 ? (
        <Empty>No competencies defined yet.</Empty>
      ) : (
        <Table head={["Competency", "Level", "Last assessed"]}>
          {items.map((c) => (
            <tr key={c.competency_id} className="border-t">
              <td className="px-4 py-2 font-medium">
                {c.name}
                {c.category && <span className="ml-2 text-xs text-muted-foreground">{c.category}</span>}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: c.max_level }).map((_, i) => (
                      <span key={i} className={cn("h-2.5 w-2.5 rounded-sm", i < c.current_level ? "bg-primary" : "bg-muted")} />
                    ))}
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {c.current_level}/{c.max_level}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(c.assessed_on)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

function StatCard({ label, value, hint, tone, href }: { label: string; value: number | string; hint?: string; tone?: "warn" | "danger" | "ok"; href: string }) {
  const toneCls =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-green-700" : "text-foreground";
  return (
    <Link href={href} className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneCls)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Link>
  );
}

export function DashboardPanel({ data }: { data: TrainingDashboard }) {
  return (
    <Section
      icon={<LayoutDashboard className="h-5 w-5 text-primary" />}
      title="My Training Dashboard"
      subtitle="Your compliance, certificates, requests and upcoming learning at a glance."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Mandatory outstanding"
          value={data.mandatoryOpen}
          hint={`of ${data.mandatoryTotal} required`}
          tone={data.mandatoryOpen > 0 ? "danger" : "ok"}
          href="/training?view=mandatory"
        />
        <StatCard
          label="Certificates expiring"
          value={data.certsExpiring}
          hint={`of ${data.certsTotal} on record`}
          tone={data.certsExpiring > 0 ? "warn" : "ok"}
          href="/training?view=certificates"
        />
        <StatCard
          label="Competency gaps"
          value={data.gaps}
          hint="below catalogue target"
          tone={data.gaps > 0 ? "warn" : "ok"}
          href="/training?view=gaps"
        />
        <StatCard
          label="Pending requests"
          value={data.pendingRequests}
          hint="awaiting a decision"
          href="/training?view=requests"
        />
        <StatCard
          label="Upcoming sessions"
          value={data.upcomingSessions}
          hint="you're enrolled in"
          tone="ok"
          href="/training?view=calendar"
        />
        <StatCard label="Open sessions" value="Browse" hint="self-enrol now" href="/training?view=open-sessions" />
      </div>

      {data.nextSession && (
        <div className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="h-4 w-4 text-primary" /> Next session
          </p>
          <p className="mt-1 text-sm">
            <span className="font-medium">{data.nextSession.course_title}</span>
            {data.nextSession.starts_at && (
              <span className="text-muted-foreground"> · {fmtDateTime(data.nextSession.starts_at)}</span>
            )}
            {data.nextSession.location && <span className="text-muted-foreground"> · {data.nextSession.location}</span>}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <QuickLink href="/training?view=requests" icon={<FilePlus2 className="h-4 w-4" />}>Request training</QuickLink>
        <QuickLink href="/training?view=idp" icon={<Target className="h-4 w-4" />}>Development plan</QuickLink>
        <QuickLink href="/training?view=browse" icon={<Award className="h-4 w-4" />}>Browse catalogue</QuickLink>
        <QuickLink href="/training?view=gaps" icon={<TriangleAlert className="h-4 w-4" />}>Close a gap</QuickLink>
        <QuickLink href="/training?view=history" icon={<History className="h-4 w-4" />}>Training history</QuickLink>
      </div>
    </Section>
  );
}

function QuickLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/40"
    >
      {icon}
      {children}
    </Link>
  );
}

export function HistoryPanel({ items }: { items: HistoryItem[] }) {
  return (
    <Section
      icon={<History className="h-5 w-5 text-primary" />}
      title="Training History"
      subtitle={`${items.length} completed training record(s)`}
    >
      {items.length === 0 ? (
        <Empty>No completed training on record yet.</Empty>
      ) : (
        <Table head={["Course", "Completed", "Expires", "Source", "Certificate"]}>
          {items.map((h) => (
            <tr key={h.id} className="border-t">
              <td className="px-4 py-2 font-medium">{h.course_title}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(h.completed_on)}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(h.expires_on)}</td>
              <td className="px-4 py-2">
                <span className="capitalize text-muted-foreground">{h.source}</span>
                {h.source === "self" && (
                  <span
                    className={cn(
                      "ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      h.verified ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                    )}
                  >
                    {h.verified ? "verified" : "unverified"}
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {h.certificate_url ? (
                  <a href={h.certificate_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {h.certificate_no || "Download"}
                  </a>
                ) : (
                  h.certificate_no || "—"
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function PlannedPanel({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-8 text-center">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This view is part of the Training &amp; Competence module and is planned for a later delivery
        phase. The data model and navigation are already in place.
      </p>
    </div>
  );
}

export function NoAccessPanel() {
  return (
    <div className="rounded-lg border bg-card p-8 text-center">
      <p className="text-sm font-medium">You don&apos;t have access to this view.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask a Training Administrator to grant the relevant access.
      </p>
    </div>
  );
}

// --- shared building blocks -------------------------------------------------

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {icon} {title}
        </h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
