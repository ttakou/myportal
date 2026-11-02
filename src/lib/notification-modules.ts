/**
 * Which module a notification belongs to, and whether that module may still
 * reach people.
 *
 * A notification is tied to its module by the page it links to: the first
 * path segment of its URL is the module's route ("/savings?view=forecast"
 * belongs to Savings). A module the tenant has switched off sends nothing;
 * one whose email switch is off still rings the bell and the phone, but is
 * never emailed. Links to shared pages (the dashboard, an account page) and
 * the always-on core belong to no module and are never held back.
 *
 * Pure: the module states come in, so it is tested.
 */

export interface ModuleNotifyState {
  slug: string;
  active: boolean;
  /** The module's "Email notifications" switch (on unless turned off). */
  email: boolean;
}

/** Module states of one tenant, keyed by route segment ("savings", "out-of-town"). */
export type ModuleStates = Map<string, ModuleNotifyState>;

/** "/savings?view=forecast" → "savings"; nothing for no link or an external one. */
export function urlSegment(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/")) return null;
  const seg = url.slice(1).split(/[/?#]/)[0];
  return seg || null;
}

/** The module a notification belongs to: the one named, else the one its link opens. */
export function moduleFor(
  states: ModuleStates | undefined,
  url: string | null | undefined,
  slug?: string | null,
): ModuleNotifyState | null {
  if (!states) return null;
  if (slug) {
    for (const m of states.values()) if (m.slug === slug) return m;
    return null;
  }
  const seg = urlSegment(url);
  return seg ? states.get(seg) ?? null : null;
}

/** A switched-off module reaches nobody. */
export function notifyAllowed(m: ModuleNotifyState | null): boolean {
  return !m || m.active;
}

/** Email also needs the module's email switch on. */
export function emailAllowed(m: ModuleNotifyState | null): boolean {
  return !m || (m.active && m.email);
}
