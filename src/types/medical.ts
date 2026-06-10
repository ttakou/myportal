export type FitnessStatus = "fit" | "fit_with_restrictions" | "unfit" | "pending";

export const FITNESS_LABEL: Record<FitnessStatus, string> = {
  fit: "Fit to work",
  fit_with_restrictions: "Fit with restrictions",
  unfit: "Unfit",
  pending: "Pending exam",
};

export interface MedicalRecord {
  id: string;
  profile_id: string;
  person_name: string | null;
  person_email: string;
  fitness_status: FitnessStatus;
  exam_date: string;
  expiry_date: string | null;
  restrictions: string | null;
  notes: string | null;
}

/** Days until expiry (negative = expired, null = no expiry). */
export function daysToExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry + "T00:00:00").getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}
