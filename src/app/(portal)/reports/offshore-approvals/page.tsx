import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess, getCachedUser } from "@/lib/auth";
import { siteClock, siteDate } from "@/lib/visitors/daily";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { getApprovalsLog, type ApprovalDecision, type ApprovalRow } from "@/lib/offshore/approvals-log";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";
import { ParamSelect } from "../_components/param-select";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DECISION_LABEL: Record<ApprovalDecision, string> = {
  approved: "Approved",
  rejected: "Rejected",
  pending: "Awaiting decision",
};
const DECISION_TONE: Record<ApprovalDecision, string> = {
  approved: "bg-green-100 text-green-800",
  rejected: "bg-destructive/10 text-destructive",
  pending: "bg-amber-100 text-amber-900",
};
const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  hse_cleared: "HSE cleared",
  manifested: "Manifested",
  onboard: "On board",
  demobilised: "Demobilised",
  returned: "Returned",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function pobText(r: ApprovalRow): string {
  if (!r.pob) return "—";
  return r.pob.capacity > 0 ? `${r.pob.peak} / ${r.pob.capacity}` : String(r.pob.peak);
}

export default async function OffshoreApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; decision?: string; who?: string }>;
}) {
  const [access, me] = await Promise.all([getAccess(), getCachedUser()]);
  if (!(access.isOim || access.isCampboss)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">This report is for the OIM, the Campboss and administrators.</p>
        <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const today = siteDate(new Date().toISOString());
  const monthStart = today.slice(0, 8) + "01";
  const from = sp.from && ISO.test(sp.from) ? sp.from : monthStart;
  const to = sp.to && ISO.test(sp.to) ? sp.to : today;
  const decision = (["all", "decided", "approved", "rejected", "pending"] as const).find((d) => d === sp.decision) ?? "all";
  // The OIM starts on their own decisions; anyone else on everybody's.
  const onlyMine = sp.who ? sp.who === "me" : access.isOim && !access.isAdmin;

  const rows = await getApprovalsLog({ from, to, decision, decidedBy: onlyMine ? me?.id ?? null : null });
  const count = (d: ApprovalDecision) => rows.filter((r) => r.decision === d).length;
  const overCap = rows.filter((r) => r.decision !== "rejected" && r.pob?.over).length;

  const csv: string[][] = [
    ["Decision", "Decided on", "Decided by", "Type", "Person", "Company", "Installation", "From", "To", "Purpose", "Requested by", "Now", "Peak POB during stay", "POB limit", "Over limit", "Reason"],
    ...rows.map((r) => [
      DECISION_LABEL[r.decision],
      `${siteDate(r.at)} ${siteClock(r.at)}`,
      r.decidedBy ?? "",
      r.kind === "visit" ? "Visitor" : "Staff trip",
      r.person,
      r.company ?? "",
      r.installation ?? "",
      r.from,
      r.to ?? "",
      r.purpose ?? "",
      r.requester ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      r.pob ? String(r.pob.peak) : "",
      r.pob?.capacity ? String(r.pob.capacity) : "",
      r.pob?.over ? "Yes" : "",
      r.reason ?? "",
    ]),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/reports/pob-outlook" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            POB outlook
          </Link>
          <CsvExportButton filename={`offshore-approvals-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Offshore approvals log"
        subtitle="Visitor requests and staff trips decided in the period, and those still awaiting a decision, each with the fullest day on the installation during the stay against its POB limit. Rotational crews are counted by their rotation schedule."
        meta={[
          `Decided ${from} → ${to}`,
          onlyMine ? "My decisions" : "Everyone's decisions",
          decision === "all" ? "All decisions" : decision === "decided" ? "Approved and rejected" : DECISION_LABEL[decision],
        ]}
      />

      <div className="print:hidden">
        <ReportFilters show={{ period: true }} from={from} to={to}>
          <ParamSelect
            name="decision"
            label="Decision"
            options={[
              { value: "all", label: "All, incl. awaiting" },
              { value: "decided", label: "Approved and rejected" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "pending", label: "Awaiting decision" },
            ]}
          />
          <ParamSelect
            name="who"
            label="Decided by"
            options={
              onlyMine
                ? [
                    { value: "me", label: "Me" },
                    { value: "all", label: "Everyone" },
                  ]
                : [
                    { value: "all", label: "Everyone" },
                    { value: "me", label: "Me" },
                  ]
            }
          />
        </ReportFilters>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Approved" value={count("approved")} tone="green" />
        <Kpi label="Rejected" value={count("rejected")} />
        <Kpi label="Awaiting decision" value={count("pending")} tone={count("pending") ? "amber" : undefined} />
        <Kpi label="Over the POB limit" value={overCap} tone={overCap ? "red" : undefined} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Decision</th>
              <th className="px-3 py-2 font-medium">Who / purpose</th>
              <th className="px-3 py-2 font-medium">Stay</th>
              <th className="px-3 py-2 font-medium">Now</th>
              <th className="px-3 py-2 text-right font-medium">Peak POB</th>
            </tr>
          </thead>
          <ProgressiveTableBody colSpan={5} className="divide-y" label="Show more requests">
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="align-top">
                <td className="px-3 py-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", DECISION_TONE[r.decision])}>{DECISION_LABEL[r.decision]}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {siteDate(r.at)} {siteClock(r.at)}
                    {r.decidedBy ? ` · ${r.decidedBy}` : r.decision === "pending" ? " · raised" : ""}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium">{r.person}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}· {r.kind === "visit" ? "visitor" : "staff trip"}
                    {r.company ? ` · ${r.company}` : ""}
                  </span>
                  {r.purpose && <span className="block text-xs text-muted-foreground">{r.purpose}</span>}
                  {r.requester && <span className="block text-[11px] text-muted-foreground">raised by {r.requester}</span>}
                  {r.reason && r.decision === "rejected" && <span className="block text-[11px] text-destructive">{r.reason}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.installation ?? "—"}
                  <span className="block tabular-nums">
                    {r.from}
                    {r.to ? ` → ${r.to}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.pob?.over && "font-semibold text-destructive")}>
                  {pobText(r)}
                  {r.pob?.date && <span className="block text-[11px] font-normal text-muted-foreground">on {r.pob.date}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Nothing decided in this period.
                </td>
              </tr>
            )}
          </ProgressiveTableBody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Peak POB is the fullest day of the stay on that installation: crews by their rotation schedule, plus approved
        trips and visitors. For a request awaiting a decision it includes the request itself.
      </p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
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
