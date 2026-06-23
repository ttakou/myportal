import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { getCalibrationSettings } from "@/lib/calibration";
import { computeBalance } from "@/lib/calibration-balance";
import type { DistributionBand, GroupBy } from "@/types/calibration";
import type { BalanceResult, CalibrationGate, PanelMember } from "@/types/calibration-panel";

export interface PanelStaff {
  appraisalId: string;
  employeeId: string;
  name: string;
  provisionalLabel: string | null;
  provisionalScore: number | null;
  gate: CalibrationGate;
  /** Panel-agreed band (mode of member ratings, else provisional). */
  panelBand: string | null;
  /** A panellist rated them in a higher band than the agreed one. */
  upgradeCandidate: boolean;
  /** Member ratings recorded so far (for completion). */
  ratedBy: number;
}

export interface MemberRatingView {
  memberId: string;
  memberName: string;
  bandLabel: string;
  comment: string | null;
}

/** One recorded calibration adjustment for a staff member (PGM audit trail). */
export interface AdjustmentView {
  previousLabel: string | null;
  newLabel: string | null;
  reason: string | null;
  byName: string | null;
  at: string;
}

export interface PanelData {
  group: { id: string; name: string; status: string; groupBy: GroupBy; groupValue: string | null };
  target: DistributionBand[];
  members: PanelMember[];
  staff: PanelStaff[];
  /** All members' ratings per appraisal (for the discussion view). */
  ratingsByStaff: Record<string, MemberRatingView[]>;
  /** Calibration adjustment trail per appraisal (newest first) — PGM audit. */
  adjustmentsByStaff: Record<string, AdjustmentView[]>;
  /** The signed-in user's own rating per appraisal. */
  myRatings: Record<string, { bandLabel: string; comment: string | null }>;
  balance: BalanceResult;
  /** Target band labels, top contributor → lowest. */
  bandOrder: string[];
  /** Panel finished when every staff member is rated by every panellist. */
  panelComplete: boolean;
  panelProgress: { rated: number; expected: number };
  isMember: boolean;
  isHr: boolean;
}

function nameOf(embed: unknown): string {
  const o = Array.isArray(embed) ? embed[0] : embed;
  return (o as { full_name?: string } | null)?.full_name ?? "Unknown";
}
function deptOf(embed: unknown): string | null {
  const o = Array.isArray(embed) ? embed[0] : embed;
  return (o as { department?: string } | null)?.department ?? null;
}

function mode(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  let tie = false;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
      tie = false;
    } else if (n === bestN) tie = true;
  }
  return tie ? null : best;
}

export async function getPanelData(groupId: string): Promise<PanelData | null> {
  const supabase = createClient();
  const access = await getAccess();
  const isHr = access.isHr || access.isSystemAdmin || access.isAdmin;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: g } = await supabase
    .from("calibration_groups")
    .select("id, name, status, group_by, group_value, cycle_id, distribution")
    .eq("id", groupId)
    .maybeSingle();
  if (!g) return null;
  const group = g as Record<string, unknown>;

  const settings = await getCalibrationSettings();
  const target: DistributionBand[] = Array.isArray(group.distribution) && group.distribution.length
    ? (group.distribution as DistributionBand[])
    : settings.distribution;

  // Staff in scope: scored appraisals in the cycle, filtered by department when
  // the group is department-scoped.
  const { data: aps } = await supabase
    .from("appraisals")
    .select("id, employee_id, final_score, rating_label, calibration_gate, employee:profiles!employee_id(full_name, department)")
    .eq("cycle_id", group.cycle_id as string)
    .not("final_score", "is", null);

  const groupBy = (group.group_by as GroupBy) ?? "department";
  const groupValue = (group.group_value as string | null) ?? null;
  const staffRows = ((aps ?? []) as Record<string, unknown>[]).filter((a) => {
    if (groupBy === "department" && groupValue) return deptOf(a.employee) === groupValue;
    return true; // other dimensions: include all (no profile column yet)
  });

  // Panel members + ratings.
  const [{ data: memberRows }, { data: ratingRows }] = await Promise.all([
    supabase
      .from("calibration_panel_members")
      .select("id, member_id, member:profiles!member_id(full_name)")
      .eq("group_id", groupId),
    supabase
      .from("calibration_panel_ratings")
      .select("appraisal_id, member_id, band_label, comment, member:profiles!member_id(full_name)")
      .eq("group_id", groupId),
  ]);

  const members: PanelMember[] = ((memberRows ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    memberId: String(m.member_id),
    name: nameOf(m.member),
  }));
  const isMember = !!user && members.some((m) => m.memberId === user.id);

  const ratingsByStaff: Record<string, MemberRatingView[]> = {};
  const myRatings: Record<string, { bandLabel: string; comment: string | null }> = {};
  const bandsByStaff = new Map<string, string[]>();
  for (const r of (ratingRows ?? []) as Record<string, unknown>[]) {
    const aid = String(r.appraisal_id);
    (ratingsByStaff[aid] ??= []).push({
      memberId: String(r.member_id),
      memberName: nameOf(r.member),
      bandLabel: String(r.band_label),
      comment: (r.comment as string | null) ?? null,
    });
    bandsByStaff.set(aid, [...(bandsByStaff.get(aid) ?? []), String(r.band_label)]);
    if (user && r.member_id === user.id) {
      myRatings[aid] = { bandLabel: String(r.band_label), comment: (r.comment as string | null) ?? null };
    }
  }

  const bandOrder = target.map((t) => t.label);
  const rank = new Map(bandOrder.map((label, i) => [label, i]));
  const rankOf = (label: string | null) => (label != null && rank.has(label) ? rank.get(label)! : 99);

  const staff: PanelStaff[] = staffRows.map((a) => {
    const id = String(a.id);
    const provisionalLabel = (a.rating_label as string | null) ?? null;
    const memberBands = bandsByStaff.get(id) ?? [];
    const panelBand = mode(memberBands) ?? provisionalLabel;
    // A higher band has a lower rank index, so a panellist "upgrades" them.
    const upgradeCandidate = memberBands.some((b) => rankOf(b) < rankOf(panelBand));
    return {
      appraisalId: id,
      employeeId: String(a.employee_id),
      name: nameOf(a.employee),
      provisionalLabel,
      provisionalScore: (a.final_score as number | null) ?? null,
      gate: (a.calibration_gate as CalibrationGate) ?? "provisional",
      panelBand,
      upgradeCandidate,
      ratedBy: memberBands.length,
    };
  });

  const ratedFully = staff.filter((s) => members.length > 0 && s.ratedBy >= members.length).length;
  const panelComplete = members.length > 0 && ratedFully === staff.length && staff.length > 0;

  // Calibration adjustment trail per staff member (PGM audit), newest first.
  const adjustmentsByStaff: Record<string, AdjustmentView[]> = {};
  const staffIds = staff.map((s) => s.appraisalId);
  if (staffIds.length) {
    const { data: adjRows } = await supabase
      .from("appraisal_calibration_adjustments")
      .select("appraisal_id, previous_label, new_label, reason, created_at, adjuster:profiles!adjusted_by(full_name)")
      .in("appraisal_id", staffIds)
      .order("created_at", { ascending: false });
    for (const r of (adjRows ?? []) as Record<string, unknown>[]) {
      (adjustmentsByStaff[String(r.appraisal_id)] ??= []).push({
        previousLabel: (r.previous_label as string | null) ?? null,
        newLabel: (r.new_label as string | null) ?? null,
        reason: (r.reason as string | null) ?? null,
        byName: nameOf(r.adjuster),
        at: String(r.created_at),
      });
    }
  }

  // Balance the panel-agreed bands against the target.
  const counts: Record<string, number> = {};
  for (const s of staff) if (s.panelBand) counts[s.panelBand] = (counts[s.panelBand] ?? 0) + 1;
  const balance = computeBalance(counts, target, staff.length);

  return {
    group: {
      id: String(group.id),
      name: String(group.name ?? ""),
      status: String(group.status ?? "open"),
      groupBy,
      groupValue,
    },
    target,
    members,
    staff,
    ratingsByStaff,
    adjustmentsByStaff,
    myRatings,
    balance,
    bandOrder,
    panelComplete,
    panelProgress: { rated: ratedFully, expected: staff.length },
    isMember,
    isHr,
  };
}
