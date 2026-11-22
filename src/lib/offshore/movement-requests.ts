import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { one } from "./_shared";
import type { MoveKind, MoveReason, MoveStatus } from "./movement-change";

/** One movement change request as the screens show it. */
export interface MovementRequestRow {
  id: string;
  profile_id: string;
  person: string;
  crew: string | null;
  installation_id: string | null;
  kind: MoveKind;
  /** Empty when a demob date is being set for the first time. */
  scheduled_date: string | null;
  requested_date: string;
  reason: MoveReason;
  note: string | null;
  cover_note: string | null;
  status: MoveStatus;
  requested_by: string | null;
  requester: string | null;
  endorser: string | null;
  endorsed_at: string | null;
  endorse_comment: string | null;
  decider: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_comment: string | null;
  applied_at: string | null;
  created_at: string;
}

const SELECT =
  "id, profile_id, installation_id, kind, scheduled_date, requested_date, reason, note, cover_note, status," +
  " requested_by, endorsed_at, endorse_comment, decided_by, decided_at, decision_comment, applied_at, created_at," +
  " person:profiles!offshore_movement_requests_profile_id_fkey(full_name, email)," +
  " requester:profiles!offshore_movement_requests_requested_by_fkey(full_name)," +
  " endorser:profiles!offshore_movement_requests_endorsed_by_fkey(full_name)," +
  " decider:profiles!offshore_movement_requests_decided_by_fkey(full_name)," +
  " crew:offshore_crews(name)";

type Row = Record<string, any>;
const name = (v: unknown) => one<{ full_name?: string; email?: string }>(v as never);

export function toMovementRow(r: Row): MovementRequestRow {
  return {
    id: r.id,
    profile_id: r.profile_id,
    person: name(r.person)?.full_name || name(r.person)?.email || "Staff member",
    crew: one<{ name?: string }>(r.crew)?.name ?? null,
    installation_id: r.installation_id ?? null,
    kind: r.kind,
    scheduled_date: r.scheduled_date ?? null,
    requested_date: r.requested_date,
    reason: r.reason,
    note: r.note ?? null,
    cover_note: r.cover_note ?? null,
    status: r.status,
    requested_by: r.requested_by ?? null,
    requester: name(r.requester)?.full_name ?? null,
    endorser: name(r.endorser)?.full_name ?? null,
    endorsed_at: r.endorsed_at ?? null,
    endorse_comment: r.endorse_comment ?? null,
    decider: name(r.decider)?.full_name ?? null,
    decided_by: r.decided_by ?? null,
    decided_at: r.decided_at ?? null,
    decision_comment: r.decision_comment ?? null,
    applied_at: r.applied_at ?? null,
    created_at: r.created_at,
  };
}

/** Requests matching a filter, newest first, on whichever client the caller holds. */
export async function listMovementRequests(
  client: SupabaseClient,
  filter: (q: any) => any,
  limit = 200,
): Promise<MovementRequestRow[]> {
  const { data } = await filter(client.from("offshore_movement_requests").select(SELECT)).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as Row[]).map(toMovementRow);
}

/** Decided in a period, for the OIM's approvals log. */
export async function movementDecisions(client: SupabaseClient, from: string, to: string, decidedBy: string | null): Promise<MovementRequestRow[]> {
  return listMovementRequests(
    client,
    (q) => {
      let x = q.in("status", ["approved", "rejected"]).gte("decided_at", `${from}T00:00:00Z`).lte("decided_at", `${to}T23:59:59Z`);
      if (decidedBy) x = x.eq("decided_by", decidedBy);
      return x;
    },
    1000,
  );
}
