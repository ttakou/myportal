/**
 * The visitor directory: one record per person who comes to site. A new
 * registration is matched to it on the ID number first, then the phone,
 * then name and company; the do-not-admit flag lives there. Pure.
 */

export interface DirectoryMatchInput {
  full_name: string;
  company?: string | null;
  id_document_number?: string | null;
  phone?: string | null;
}

export interface DirectoryCandidate extends DirectoryMatchInput {
  id: string;
}

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
/** Digits only, so "+237 6 99 00 11 22" and "699001122" agree. */
export const phoneKey = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^237(?=\d{9}$)/, "");
export const idKey = (s: string | null | undefined) => clean(s).replace(/[\s-]/g, "");

/** The person key: ID number when known, else name and company. */
export function directoryKey(v: DirectoryMatchInput): string {
  const id = idKey(v.id_document_number);
  if (id) return `id:${id}`;
  return `name:${clean(v.full_name)}|${clean(v.company)}`;
}

/** The directory record a registration belongs to, if any: ID number, then phone, then name + company. */
export function matchDirectory<T extends DirectoryCandidate>(input: DirectoryMatchInput, candidates: T[]): T | null {
  const id = idKey(input.id_document_number);
  if (id) {
    const hit = candidates.find((c) => idKey(c.id_document_number) === id);
    if (hit) return hit;
  }
  const ph = phoneKey(input.phone);
  if (ph.length >= 8) {
    const hit = candidates.find((c) => phoneKey(c.phone) === ph);
    if (hit) return hit;
  }
  const name = clean(input.full_name);
  const company = clean(input.company);
  if (!name) return null;
  const sameName = candidates.filter((c) => clean(c.full_name) === name);
  if (sameName.length === 0) return null;
  return sameName.find((c) => clean(c.company) === company) ?? (company ? null : sameName[0]);
}

/** "4th visit" style ordinal for a history line. */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
