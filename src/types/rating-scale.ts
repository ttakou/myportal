export type RatingScaleKind = "performance" | "competency" | "generic";

export const RATING_SCALE_KINDS: RatingScaleKind[] = ["performance", "competency", "generic"];

export const RATING_SCALE_KIND_LABEL: Record<RatingScaleKind, string> = {
  performance: "Performance",
  competency: "Competency",
  generic: "Generic",
};

/** One level on a rating scale (e.g. 5 → "Outstanding"). */
export interface RatingScaleLevel {
  value: number;
  label: string;
  description?: string | null;
  color?: string | null;
}

/** An HR-defined rating scale referenced by cycles and form sections. */
export interface RatingScale {
  id: string;
  name: string;
  description: string | null;
  kind: RatingScaleKind;
  levels: RatingScaleLevel[];
  allowDecimals: boolean;
  commentRequired: boolean;
  evidenceRequired: boolean;
  showNumericToEmployee: boolean;
  isDefault: boolean;
  isActive: boolean;
}

/** Min/max numeric bounds derived from a scale's levels. */
export function scaleBounds(levels: RatingScaleLevel[]): { min: number; max: number } {
  if (!levels.length) return { min: 0, max: 0 };
  const vals = levels.map((l) => l.value);
  return { min: Math.min(...vals), max: Math.max(...vals) };
}
