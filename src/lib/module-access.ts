/**
 * Modules every signed-in member of a subscribing organisation may open,
 * whatever their access roles. Offshore is one: anyone may request an
 * offshore trip or a visit from "My trips & requests". What they can see
 * and do inside it is still decided by their offshore role — without one
 * they get the self-service views only.
 */
export const OPEN_TO_ALL_MODULES: readonly string[] = ["offshore"];

export function openToAll(slug: string): boolean {
  return OPEN_TO_ALL_MODULES.includes(slug);
}
