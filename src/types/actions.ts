/** Standard result shape returned by server actions. */
export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Optional non-blocking advisory shown to the user (e.g. double-booking). */
  warning?: string;
}
