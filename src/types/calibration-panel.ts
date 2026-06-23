export type CalibrationGate = "provisional" | "panel" | "pgm" | "final";

export const CALIBRATION_GATES: CalibrationGate[] = ["provisional", "panel", "pgm", "final"];

export const GATE_LABEL: Record<CalibrationGate, string> = {
  provisional: "Provisional (line manager)",
  panel: "Panel rating",
  pgm: "PGM final rating",
  final: "Finalised",
};

export interface PanelMember {
  id: string;
  memberId: string;
  name: string;
}

export interface PanelRating {
  appraisalId: string;
  memberId: string;
  bandLabel: string;
  comment: string | null;
}

/** One band's standing against its configured cap. */
export interface BalanceBand {
  label: string;
  targetPercent: number | null;
  /** Maximum headcount allowed in this band (floor(total × percent)). */
  targetMax: number | null;
  count: number;
  actualPercent: number;
  /** Over the cap? (only meaningful when a target is set) */
  over: boolean;
  /** Remaining room under the cap (targetMax − count); negative if over. */
  room: number | null;
}

export interface BalanceResult {
  bands: BalanceBand[];
  suggestions: string[];
  withinLimits: boolean;
  rated: number;
  total: number;
}
