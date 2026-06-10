export type OkrStatus = "active" | "closed";

export interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string | null;
}

export interface Objective {
  id: string;
  title: string;
  period: string;
  status: OkrStatus;
  key_results: KeyResult[];
  progress: number; // 0..100 average across KRs
}

export interface Feedback {
  id: string;
  from_name: string | null;
  to_name: string | null;
  body: string;
  created_at: string;
}

export interface NineBoxCell {
  profile_id: string;
  person_name: string | null;
  performance: number;
  potential: number;
  period: string;
}

export const NINE_BOX_LABELS: Record<string, string> = {
  "3-3": "Star",
  "3-2": "High performer",
  "3-1": "Workhorse",
  "2-3": "High potential",
  "2-2": "Core player",
  "2-1": "Solid performer",
  "1-3": "Enigma",
  "1-2": "Inconsistent",
  "1-1": "Risk",
};
