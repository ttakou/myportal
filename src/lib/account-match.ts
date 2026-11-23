/**
 * Recognising that a first sign-in (Microsoft / Google) belongs to someone
 * the organisation already registered — often from the offshore roster, with
 * no email — so the two can be linked instead of leaving a duplicate.
 *
 * Names are compared as sets of words, whatever the order, case, accents or
 * separators: "Alain.Talla", "TALLA Alain" and "Alain Talla" are one name.
 * The local part of a work email counts as a name too ("alain.talla@…").
 *
 * Pure: names in, decisions out.
 */

/** The words of a name, normalised and sorted; bracketed notes are ignored. */
export function nameWords(name: string | null | undefined): string[] {
  if (!name) return [];
  const plain = name
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const words = plain.split(/[^a-z]+/).filter((w) => w.length >= 2);
  return [...new Set(words)].sort();
}

/** The name an email's local part spells ("fred.bessong2@x" → fred bessong). */
export function emailNameWords(email: string | null | undefined): string[] {
  if (!email || !email.includes("@")) return [];
  return nameWords(email.split("@")[0]);
}

export function emailDomain(email: string | null | undefined): string {
  return email && email.includes("@") ? email.split("@").pop()!.trim().toLowerCase() : "";
}

/** A sign-in from one of the organisation's own email domains. */
export function isOrgDomain(email: string | null | undefined, domains: readonly string[]): boolean {
  const d = emailDomain(email);
  return !!d && domains.some((x) => x.trim().toLowerCase() === d);
}

/**
 * How two names compare: "exact" when they have the same words (at least
 * two), "partial" when one's words all appear in the other (at least two
 * shared — a middle name added or dropped), otherwise null.
 */
export function compareNames(a: string[], b: string[]): "exact" | "partial" | null {
  if (a.length < 2 || b.length < 2) return null;
  const sb = new Set(b);
  const shared = a.filter((w) => sb.has(w)).length;
  if (shared === a.length && shared === b.length) return "exact";
  if (shared >= 2 && (shared === a.length || shared === b.length)) return "partial";
  return null;
}

export interface ExistingAccount {
  id: string;
  full_name: string | null;
  /** Has the person ever signed in to this account? */
  signedIn: boolean;
}

export interface AccountMatch {
  id: string;
  full_name: string | null;
  strength: "exact" | "partial";
  signedIn: boolean;
}

/**
 * Existing accounts that look like the person who just signed in, judged on
 * their display name and on the name their email spells. Exact first.
 */
export function findAccountMatches(
  signIn: { email: string | null; fullName: string | null },
  accounts: ExistingAccount[],
): AccountMatch[] {
  const keys = [nameWords(signIn.fullName), emailNameWords(signIn.email)].filter((k) => k.length >= 2);
  const out: AccountMatch[] = [];
  for (const a of accounts) {
    const words = nameWords(a.full_name);
    let best: "exact" | "partial" | null = null;
    for (const k of keys) {
      const c = compareNames(k, words);
      if (c === "exact") best = "exact";
      else if (c === "partial" && !best) best = "partial";
    }
    if (best) out.push({ id: a.id, full_name: a.full_name, strength: best, signedIn: a.signedIn });
  }
  return out.sort((x, y) => (x.strength === y.strength ? 0 : x.strength === "exact" ? -1 : 1));
}

/**
 * The one account to link to automatically, or null to leave it to an admin.
 * Only for a sign-in from the organisation's own domain (anyone can name
 * themselves anything on an outside account), only when exactly one account
 * matches exactly, and only if that account was never signed in to — one in
 * use is someone's live login, not a placeholder.
 */
export function autoLinkTarget(
  signIn: { email: string | null; fullName: string | null },
  matches: AccountMatch[],
  orgDomains: readonly string[],
): string | null {
  if (!isOrgDomain(signIn.email, orgDomains)) return null;
  const exact = matches.filter((m) => m.strength === "exact");
  if (exact.length !== 1) return null;
  return exact[0].signedIn ? null : exact[0].id;
}
