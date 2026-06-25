export type SavingsTxnKind = "contribution" | "withdrawal" | "interest";
export type WithdrawalStatus = "requested" | "approved" | "rejected" | "released";

/** A savings transaction is a debit only when it is a withdrawal. */
export const isCredit = (kind: SavingsTxnKind) => kind !== "withdrawal";

export interface WithdrawalRequest {
  id: string;
  profile_id: string;
  person_name: string | null;
  amount: number;
  reason: string | null;
  status: WithdrawalStatus;
  decision_note: string | null;
  decided_at: string | null;
  released_at: string | null;
  created_at: string;
  /** The requester's current account balance (for the approver's context). */
  account_balance?: number;
}

export interface SavingsTxn {
  id: string;
  kind: SavingsTxnKind;
  amount: number;
  note: string | null;
  period: string | null;
  created_at: string;
}

export interface SavingsAccount {
  id: string;
  profile_id: string;
  person_name: string | null;
  balance: number;
  transactions: SavingsTxn[];
}

export interface AccountSummary {
  id: string;
  profile_id: string;
  person_name: string | null;
  balance: number;
}

/**
 * All savings amounts are in Central African CFA francs (XAF). XAF has no minor
 * unit, so we render whole francs with thousands separators (e.g. "1 250 000 FCFA").
 */
export const money = (n: number) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "XAF",
    maximumFractionDigits: 0,
  });

/** A printable account statement for a member over a chosen period. */
export interface StatementHolder {
  profile_id: string;
  full_name: string | null;
  emp_num: string | null;
  email: string | null;
  department: string | null;
  job_title: string | null;
  employee_type: string | null;
}

export interface Statement {
  holder: StatementHolder;
  /** ISO dates bounding the period (inclusive of from, exclusive of to+1day). */
  from: string;
  to: string;
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  transactions: SavingsTxn[];
}
