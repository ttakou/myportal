export type SavingsTxnKind = "contribution" | "withdrawal";
export type LoanStatus = "active" | "closed";

export interface SavingsTxn {
  id: string;
  kind: SavingsTxnKind;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface Loan {
  id: string;
  principal: number;
  annual_rate: number;
  term_months: number;
  monthly_payment: number;
  outstanding: number;
  status: LoanStatus;
  start_date: string;
}

export interface SavingsAccount {
  id: string;
  profile_id: string;
  person_name: string | null;
  balance: number;
  transactions: SavingsTxn[];
  loans: Loan[];
}

export interface AccountSummary {
  id: string;
  profile_id: string;
  person_name: string | null;
  balance: number;
}

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });
