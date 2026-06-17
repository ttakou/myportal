// Shared internals for the offshore data-access modules.

export const DAY_MS = 86_400_000;
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Normalise a PostgREST embed (object | single-element array | null) to T | null. */
export function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}
