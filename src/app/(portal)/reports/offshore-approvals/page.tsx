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
import { createClient } from "@/lib/supabase/server";
import { listMovementRequests, movementDecisions } from "@/lib/offshore/movement-requests";
import { MOVE_KIND_LABEL, MOVE_REASON_LABEL, MOVE_STATUS_LABEL, shiftDays, shiftLabel } from "@/lib/offshore/movement-change";

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

  const supabase = createClient();
  const [rows, decidedMoves, openMoves] = await Promise.all([
    getApprovalsLog({ from, to, decision, decidedBy: onlyMine ? me?.id ?? null : null }),
    decision === "pending" ? Promise.resolve([]) : movementDecisions(supabase, from, to, onlyMine ? me?.id ?? null : null),
    decision === "all" || decision === "pending"
      ? listMovementRequests(supabase, (q) => q.in("status", ["pending_endorsement", "pending"]))
      : Promise.resolve([]),
  ]);
  // Early / late mob and demob changes, filtered like the rest.
  const moves = [
    ...openMoves,
    ...decidedMoves.filter((m) => decision === "all" || decision === "decided" || m.status === decision),
  ];
  const approvedMoves = moves.filter((m) => m.status === "approved");
  const daysEarly = approvedMoves.filter((m) => m.kind.startsWith("early")).reduce((n, m) => n + shiftDays(m.scheduled_date, m.requested_date), 0);
  const daysLate = approvedMoves.filter((m) => m.kind.startsWith("late")).reduce((n, m) => n + shiftDays(m.scheduled_date, m.requested_date), 0);
  const moveCsv: string[][] = [
    ["Status", "Decided on", "Decided by", "Comment", "Person", "Crew", "Change", "Scheduled", "Requested", "Shift", "Reason", "Details", "Cover / relief", "Raised by", "Raised on", "Endorsed by"],
    ...moves.map((m) => [
      MOVE_STATUS_LABEL[m.status],
      m.decided_at ? `${siteDate(m.decided_at)} ${siteClock(m.decided_at)}` : "",
      m.decider ?? "",
      m.decision_comment ?? "",
      m.person,
      m.crew ?? "",
      MOVE_KIND_LABEL[m.kind],
      m.scheduled_date ?? "none planned",
      m.requested_date,
      shiftLabel(m.kind, m.scheduled_date, m.requested_date),
      MOVE_REASON_LABEL[m.reason],
      m.note ?? "",
      m.cover_note ?? "",
      m.requester ?? "",
      siteDate(m.created_at),
      m.endorser ?? "",
    ]),
  ];
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
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Early / late mobilisation and demobilisation</h2>
          <div className="print:hidden">
            <CsvExportButton filename={`offshore-date-changes-${from}_${to}.csv`} table={moveCsv} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Changes approved" value={approvedMoves.length} tone="green" />
          <Kpi label="Rejected" value={moves.filter((m) => m.status === "rejected").length} />
          <Kpi label="Days moved earlier" value={daysEarly} />
          <Kpi label="Days moved later" value={daysLate} tone={daysLate ? "amber" : undefined} />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Decision</th>
                <th className="px-3 py-2 font-medium">Who / change</th>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Trail</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {moves.map((m) => (
                <tr key={m.id} className="align-top">
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        m.status === "approved" ? DECISION_TONE.approved : m.status === "rejected" ? DECISION_TONE.rejected : DECISION_TONE.pending,
                      )}
                    >
                      {MOVE_STATUS_LABEL[m.status]}
                    </span>
                    {m.decided_at && (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {siteDate(m.decided_at)} {siteClock(m.decided_at)}
                        {m.decider ? ` · ${m.decider}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{m.person}</span>
                    {m.crew && <span className="text-xs text-muted-foreground"> · {m.crew}</span>}
                    <span className="block text-xs text-muted-foreground">{MOVE_KIND_LABEL[m.kind]}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {m.scheduled_date ?? "none planned"} → <span className="text-foreground">{m.requested_date}</span>
                    <span className="block text-[11px]">{shiftLabel(m.kind, m.scheduled_date, m.requested_date)}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {MOVE_REASON_LABEL[m.reason]}
                    {m.note && <span className="block text-xs">{m.note}</span>}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    Raised {siteDate(m.created_at)}
                    {m.requester ? ` by ${m.requester}` : ""}
                    {m.endorser && <span className="block">Endorsed by {m.endorser}</span>}
                    {m.decision_comment && <span className="block">“{m.decision_comment}”</span>}
                  </td>
                </tr>
              ))}
              {moves.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No date change in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
