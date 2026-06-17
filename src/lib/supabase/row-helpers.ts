/**
 * Unwrap a Supabase embedded relation that may arrive either as a single object
 * or as a one-element array, into a single value (or null).
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
