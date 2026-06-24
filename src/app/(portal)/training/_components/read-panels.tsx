import { Award, CalendarDays, ListChecks, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLAN_STATUS_LABEL,
  type Certificate,
  type MandatoryItem,
  type PlanItem,
  type UpcomingSession,
} from "@/types/training";

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
