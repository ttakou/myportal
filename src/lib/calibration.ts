import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_CONFIDENTIALITY,
  type CalibrationGroup,
  type CalibrationMode,
  type CalibrationSettings,
  type Confidentiality,
  type DistributionBand,
  type GroupBy,
  type GroupStatus,
} from "@/types/calibration";

const DEFAULT_SETTINGS: CalibrationSettings = {
  mode: "guidance",
  distribution: [
    { label: "Exceeds", percent: 20 },
    { label: "Meets", percent: 70 },
    { label: "Below", percent: 10 },
  ],
  adjustmentLimit: 1,
  requireJustification: true,
  approvalRole: "hr",
  defaultGroupBy: "department",
  confidentiality: DEFAULT_CONFIDENTIALITY,
};

export async function getCalibrationSettings(): Promise<CalibrationSettings> {
  const supabase = createClient();
  const { data } = await supabase.from("calibration_settings").select("*").limit(1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  const r = data as Record<string, unknown>;
  return {
    mode: (r.mode as CalibrationMode) ?? "guidance",
    distribution: Array.isArray(r.distribution) ? (r.distribution as DistributionBand[]) : [],
    adjustmentLimit: Number(r.adjustment_limit ?? 1),
    requireJustification: r.require_justification !== false,
    approvalRole: (r.approval_role as string) ?? "hr",
    defaultGroupBy: (r.default_group_by as GroupBy) ?? "department",
    confidentiality: { ...DEFAULT_CONFIDENTIALITY, ...((r.confidentiality as Confidentiality) ?? {}) },
  };
}

function groupFromRow(r: Record<string, unknown>): CalibrationGroup {
  return {
    id: String(r.id),
    cycleId: (r.cycle_id as string | null) ?? null,
    name: String(r.name ?? ""),
    groupBy: (r.group_by as GroupBy) ?? "department",
    groupValue: (r.group_value as string | null) ?? null,
    status: (r.status as GroupStatus) ?? "open",
    mode: (r.mode as CalibrationMode | null) ?? null,
    distribution: Array.isArray(r.distribution) ? (r.distribution as DistributionBand[]) : null,
    adjustmentLimit: r.adjustment_limit == null ? null : Number(r.adjustment_limit),
    requireJustification: (r.require_justification as boolean | null) ?? null,
    approvalRole: (r.approval_role as string | null) ?? null,
  };
}

export async function getCalibrationGroups(cycleId?: string): Promise<CalibrationGroup[]> {
  const supabase = createClient();
  let q = supabase
    .from("calibration_groups")
    .select("*")
    .order("created_at", { ascending: true });
  if (cycleId) q = q.eq("cycle_id", cycleId);
  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map(groupFromRow);
}
