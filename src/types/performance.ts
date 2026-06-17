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
