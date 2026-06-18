import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/row-helpers";

/** Distinct, non-empty departments in the tenant — for the report filter bar. */
export async function getDepartments(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("department")
    .not("department", "is", null)
    .order("department");
  const set = new Set<string>();
  for (const r of (data ?? []) as { department: string | null }[]) {
    if (r.department) set.add(r.department);
  }
  return [...set];
}

// --- Offshore certification compliance ------------------------------------

export type CertStatus = "expired" | "expiring" | "valid" | "missing";

export interface CertCell {
  date: string | null;
  status: CertStatus;
}

export interface OffshoreCertRow {
  staff_id: string;
  name: string | null;
  department: string | null;
  company: string | null;
  position: string | null;
  medical: CertCell;
  bosiet: CertCell;
  huet: CertCell;
  /** Most severe status across the three certs. */
  worst: "expired" | "expiring" | "valid";
}

export interface OffshoreCertReport {
  rows: OffshoreCertRow[];
  summary: { nonCompliant: number; expiring: number; valid: number; total: number };
}

export interface OffshoreCertFilters {
  /** Upcoming-expiry window (inclusive). */
  from: string;
  to: string;
  department: string | null;
}

function classify(date: string | null, today: string, soon: string): CertCell {
  if (!date) return { date: null, status: "missing" };
  if (date < today) return { date, status: "expired" };
  if (date <= soon) return { date, status: "expiring" };
  return { date, status: "valid" };
}

function worstOf(cells: CertCell[]): "expired" | "expiring" | "valid" {
  // A missing cert is as non-compliant as an expired one.
  if (cells.some((c) => c.status === "expired" || c.status === "missing")) return "expired";
  if (cells.some((c) => c.status === "expiring")) return "expiring";
  return "valid";
}

/**
 * Offshore survival-cert (medical / BOSIET / HUET) compliance. Status is judged
 * as of today (expiring = within 30 days). The period filters which upcoming
 * expiries to include; already-expired or missing certs are always shown, since
 * a compliance report must surface them. Department narrows the roster. RLS
 * scopes rows to the tenant.
 */
export async function getOffshoreCertReport(
  filters: OffshoreCertFilters,
): Promise<OffshoreCertReport> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_staff")
    .select(
      "id, position, company, medical_expiry, bosiet_expiry, huet_expiry," +
        " profile:profiles!offshore_staff_profile_id_fkey(full_name, department)",
    );

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const rows: OffshoreCertRow[] = [];
  for (const r of (data ?? []) as Record<string, any>[]) {
    const prof = one<{ full_name?: string; department?: string }>(r.profile);
    const department = prof?.department ?? null;
    if (filters.department && department !== filters.department) continue;

    const medical = classify(r.medical_expiry ?? null, today, in30);
    const bosiet = classify(r.bosiet_expiry ?? null, today, in30);
    const huet = classify(r.huet_expiry ?? null, today, in30);
    const cells = [medical, bosiet, huet];
    const worst = worstOf(cells);

    const inWindow = cells.some((c) => c.date && c.date >= filters.from && c.date <= filters.to);
    if (worst !== "expired" && !inWindow) continue; // always keep non-compliant

    rows.push({
      staff_id: r.id,
      name: prof?.full_name ?? null,
      department,
      company: r.company ?? null,
      position: r.position ?? null,
      medical,
      bosiet,
      huet,
      worst,
    });
  }

  const rank = { expired: 0, expiring: 1, valid: 2 };
  rows.sort((a, b) => rank[a.worst] - rank[b.worst] || (a.name ?? "").localeCompare(b.name ?? ""));

  return {
    rows,
    summary: {
      nonCompliant: rows.filter((r) => r.worst === "expired").length,
      expiring: rows.filter((r) => r.worst === "expiring").length,
      valid: rows.filter((r) => r.worst === "valid").length,
      total: rows.length,
    },
  };
}
