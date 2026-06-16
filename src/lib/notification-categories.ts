/**
 * Shared (client-safe) notification-category constants and types.
 *
 * Emergency is deliberately absent — safety alerts are always delivered and the
 * notify pipeline never consults preferences for them.
 */
export type MutableCategory = "transport" | "flight" | "approval" | "general";

export const MUTABLE_CATEGORIES: { key: MutableCategory; label: string; help: string }[] = [
  { key: "transport", label: "Transport & driving tasks", help: "Assignments, messages and task updates." },
  { key: "flight", label: "Flight updates", help: "Delays, cancellations and diversions on your trips." },
  { key: "approval", label: "Approvals", help: "Travel and other requests awaiting your sign-off." },
  { key: "general", label: "General", help: "Everything else." },
];

export interface CategoryPref {
  in_app: boolean;
  push: boolean;
  email: boolean;
}

export type PrefMap = Record<MutableCategory, CategoryPref>;

export function defaultPrefs(): PrefMap {
  return {
    transport: { in_app: true, push: true, email: true },
    flight: { in_app: true, push: true, email: true },
    approval: { in_app: true, push: true, email: true },
    general: { in_app: true, push: true, email: true },
  };
}
