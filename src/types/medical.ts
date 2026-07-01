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

/** A scheduled (upcoming) fitness-to-work / annual medical: two hospital visits. */
export interface MedicalSchedule {
  id: string;
  profile_id: string;
  year: number;
  visit1_date: string;
  visit1_time: string | null;
  visit2_date: string | null;
  visit2_time: string | null;
  exam_indicators: string | null;
  work_location: string | null;
  /** Joined for the admin roster view. */
  person_name?: string | null;
}

/** Which scheduled visit (if any) falls on `todayIso`. */
export function visitOnDate(
  s: Pick<MedicalSchedule, "visit1_date" | "visit2_date">,
  todayIso: string,
): 1 | 2 | null {
  if (s.visit1_date === todayIso) return 1;
  if (s.visit2_date === todayIso) return 2;
  return null;
}

export const VISIT_LABEL: Record<1 | 2, string> = {
  1: "1st visit — medical exams",
  2: "2nd visit — consultation & physical screening",
};
