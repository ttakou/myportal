/**
 * Approval fallback. A request waiting on a line manager should not wait
 * forever: after the tenant's escalation delay the dispatch desk takes it.
 * Pure — the job and the page decide what to do with the ids.
 */

export interface WaitingRequest {
  id: string;
  status: string;
  created_at: string;
}

/** Requests still awaiting approval that have waited longer than `hours`. `hours <= 0` never escalates. */
export function staleApprovals<T extends WaitingRequest>(requests: T[], nowIso: string, hours: number): T[] {
  if (!(hours > 0)) return [];
  const cutoff = Date.parse(nowIso) - hours * 3_600_000;
  return requests.filter((r) => r.status === "awaiting_approval" && Date.parse(r.created_at) <= cutoff);
}

/** The note the desk and the requester read on an escalated request. */
export function escalationNote(hours: number): string {
  const h = Math.round(hours);
  return `No decision from the line manager within ${h} hour${h === 1 ? "" : "s"}; passed to the dispatch desk.`;
}

/**
 * Whether the Approvals view earns a place in the menu: approval is
 * switched on, or something is still waiting from when it was.
 */
export function showApprovalsView(approvalOn: boolean, queued: number): boolean {
  return approvalOn || queued > 0;
}
