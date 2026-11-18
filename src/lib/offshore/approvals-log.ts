import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "./_shared";
import { getPobOutlook } from "./pob-outlook-data";
import { peakDuring, visitStay } from "./pob-outlook";

export type ApprovalDecision = "approved" | "rejected" | "pending";

export interface ApprovalRow {
  id: string;
  kind: "visit" | "trip";
  decision: ApprovalDecision;
  /** When it was decided; for a pending request, when it was raised. */
  at: string;
  decidedBy: string | null;
  decidedById: string | null;
  person: string;
  company: string | null;
  installationId: string | null;
  installation: string | null;
  from: string;
  to: string | null;
  purpose: string | null;
  requester: string | null;
  /** Where it stands now: boarded, returned, cancelled… */
  status: string;
  reason: string | null;
  /** The fullest day on the installation during the stay, against the limit. */
  pob: { peak: number; capacity: number; date: string | null; over: boolean } | null;
}

const MAX_OUTLOOK_DAYS = 200;

/**
 * Offshore requests decided in a period (or still awaiting a decision), each
 * with what it means for the POB: visitor requests decided by the OIM, and
 * staff trips cleared for HSE or rejected. `decidedBy` narrows to one person's
 * decisions.
 */
export async function getApprovalsLog(input: {
  from: string;
  to: string;
  decision: ApprovalDecision | "decided" | "all";
  decidedBy: string | null;
}): Promise<ApprovalRow[]> {
  const supabase = createClient();
  const fromTs = `${input.from}T00:00:00Z`;
  const toTs = `${input.to}T23:59:59Z`;
  const want = (d: ApprovalDecision) =>
    input.decision === "all" || input.decision === d || (input.decision === "decided" && d !== "pending");

  const VISIT =
    "id, visitor_name, visitor_company, purpose, depart_date, return_date, status, reject_reason, approved_at, approved_by, created_at, installation_id," +
    " installation:offshore_installations(name), approver:profiles!offshore_visit_requests_approved_by_fkey(full_name), requester:profiles!offshore_visit_requests_requester_id_fkey(full_name)";
  const TRIP =
    "id, person_name, purpose, mobilize_date, demob_date, status, hse_cleared_at, hse_cleared_by, cancelled_at, cancelled_by, created_at, installation_id, requester_id," +
    " installation:offshore_installations(name), person:profiles!offshore_trips_profile_id_fkey(full_name)," +
    " clearer:profiles!offshore_trips_hse_cleared_by_fkey(full_name), canceller:profiles!offshore_trips_cancelled_by_fkey(full_name)," +
    " requester:profiles!offshore_trips_requester_id_fkey(full_name)";

  const [decidedVisits, pendingVisits, clearedTrips, rejectedTrips, pendingTrips] = await Promise.all([
    want("approved") || want("rejected")
      ? supabase.from("offshore_visit_requests").select(VISIT).gte("approved_at", fromTs).lte("approved_at", toTs)
      : Promise.resolve({ data: [] }),
    want("pending")
      ? supabase.from("offshore_visit_requests").select(VISIT).eq("status", "requested")
      : Promise.resolve({ data: [] }),
    want("approved")
      ? supabase.from("offshore_trips").select(TRIP).gte("hse_cleared_at", fromTs).lte("hse_cleared_at", toTs)
      : Promise.resolve({ data: [] }),
    want("rejected")
      ? supabase
          .from("offshore_trips")
          .select(TRIP)
          .eq("status", "cancelled")
          .is("hse_cleared_at", null)
          .not("requester_id", "is", null)
          .gte("cancelled_at", fromTs)
          .lte("cancelled_at", toTs)
      : Promise.resolve({ data: [] }),
    want("pending")
      ? supabase.from("offshore_trips").select(TRIP).eq("status", "requested").not("requester_id", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  const name = (v: unknown) => one<{ full_name?: string | null }>((v as never) ?? null)?.full_name ?? null;
  const rows: ApprovalRow[] = [];

  for (const v of [...((decidedVisits.data ?? []) as unknown as Record<string, unknown>[]), ...((pendingVisits.data ?? []) as unknown as Record<string, unknown>[])]) {
    const pending = v.status === "requested";
    const decision: ApprovalDecision = pending ? "pending" : v.status === "rejected" ? "rejected" : "approved";
    if (!want(decision)) continue;
    const stay = visitStay(String(v.depart_date), (v.return_date as string | null) ?? null);
    rows.push({
      id: String(v.id),
      kind: "visit",
      decision,
      at: String(pending ? v.created_at : v.approved_at),
      decidedBy: pending ? null : name(v.approver),
      decidedById: pending ? null : ((v.approved_by as string | null) ?? null),
      person: String(v.visitor_name),
      company: (v.visitor_company as string | null) ?? null,
      installationId: (v.installation_id as string | null) ?? null,
      installation: one<{ name?: string }>((v.installation as never) ?? null)?.name ?? null,
      from: stay.from,
      to: stay.to,
      purpose: (v.purpose as string | null) ?? null,
      requester: name(v.requester),
      status: String(v.status),
      reason: (v.reject_reason as string | null) ?? null,
      pob: null,
    });
  }

  const tripRow = (t: Record<string, unknown>, decision: ApprovalDecision): ApprovalRow => ({
    id: String(t.id),
    kind: "trip",
    decision,
    at: String(decision === "approved" ? t.hse_cleared_at : decision === "rejected" ? t.cancelled_at : t.created_at),
    decidedBy: decision === "approved" ? name(t.clearer) : decision === "rejected" ? name(t.canceller) : null,
    decidedById:
      decision === "approved" ? ((t.hse_cleared_by as string | null) ?? null) : decision === "rejected" ? ((t.cancelled_by as string | null) ?? null) : null,
    person: name(t.person) ?? (t.person_name as string | null) ?? "—",
    company: null,
    installationId: (t.installation_id as string | null) ?? null,
    installation: one<{ name?: string }>((t.installation as never) ?? null)?.name ?? null,
    from: String(t.mobilize_date),
    to: (t.demob_date as string | null) ?? null,
    purpose: (t.purpose as string | null) ?? null,
    requester: name(t.requester),
    status: String(t.status),
    reason: null,
    pob: null,
  });
  for (const t of (clearedTrips.data ?? []) as unknown as Record<string, unknown>[]) rows.push(tripRow(t, "approved"));
  for (const t of (rejectedTrips.data ?? []) as unknown as Record<string, unknown>[]) rows.push(tripRow(t, "rejected"));
  for (const t of (pendingTrips.data ?? []) as unknown as Record<string, unknown>[]) rows.push(tripRow(t, "pending"));

  const mine = input.decidedBy ? rows.filter((r) => r.decision === "pending" || r.decidedById === input.decidedBy) : rows;
  mine.sort((a, b) => b.at.localeCompare(a.at));

  // What each one means for the POB: the outlook over all their stays.
  const live = mine.filter((r) => r.decision !== "rejected");
  if (live.length > 0) {
    const start = live.reduce((m, r) => (r.from < m ? r.from : m), live[0].from);
    let end = live.reduce((m, r) => ((r.to ?? r.from) > m ? (r.to ?? r.from) : m), live[0].to ?? live[0].from);
    const cap = new Date(Date.parse(start + "T00:00:00Z") + MAX_OUTLOOK_DAYS * 86_400_000).toISOString().slice(0, 10);
    if (end > cap) end = cap;
    const outlook = await getPobOutlook(start, end);
    for (const r of live) r.pob = peakDuring(outlook, r.installationId, { from: r.from, to: r.to }, r.decision === "pending");
  }
  return mine;
}
