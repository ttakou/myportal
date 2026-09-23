import type { Vehicle, VehicleFuel } from "@/types/transport";

/**
 * Fleet helpers shared by the pickers and the fleet panel.
 *
 * A vehicle is either in the pool (no assignee) or assigned to a post or a
 * person. Both stay on the dispatch pickers: the desk may still send an
 * assigned car, but it should see who it belongs to first.
 */

type Labelled = Pick<Vehicle, "name" | "plate" | "assigned_to"> & { holder_name?: string | null };

/** "Operations Manager · Paul Wambo": the post and, when known, who holds it. */
export function assigneeLabel(v: Pick<Labelled, "assigned_to" | "holder_name">): string | null {
  if (!v.assigned_to && !v.holder_name) return null;
  return [v.assigned_to, v.holder_name].filter(Boolean).join(" · ");
}

/** "Toyota Prado · CE.303.MS (Operations Manager · Paul Wambo)" — name, plate, assignee. */
export function vehicleLabel(v: Labelled): string {
  const plate = v.plate ? ` · ${v.plate}` : "";
  const who = assigneeLabel(v);
  return `${v.name}${plate}${who ? ` (${who})` : ""}`;
}

/** Pool vehicles first, then the assigned ones; each group by name, then plate. */
export function poolFirst<T extends Labelled>(vehicles: T[]): T[] {
  return [...vehicles].sort((a, b) => {
    const pa = a.assigned_to ? 1 : 0;
    const pb = b.assigned_to ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name) || (a.plate ?? "").localeCompare(b.plate ?? "");
  });
}

const FUELS: VehicleFuel[] = ["diesel", "gasoline", "hybrid", "electric"];

/** "Diesel", " gasoline ", "Petrol" → the stored value; anything else → null. */
export function parseFuel(raw: string | null | undefined): VehicleFuel | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "petrol" || v === "essence") return "gasoline";
  return FUELS.includes(v as VehicleFuel) ? (v as VehicleFuel) : null;
}

/** Free text for the assignee: trimmed, "pool" (any case) or empty → null. */
export function parseAssignee(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/\s+/g, " ");
  return v === "" || v.toLowerCase() === "pool" ? null : v;
}
