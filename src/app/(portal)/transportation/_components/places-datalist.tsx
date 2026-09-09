import type { Place } from "@/types/transport";

/** The id every pickup / drop-off input points its `list` attribute at. */
export const PLACES_LIST_ID = "transport-places";

/**
 * The tenant's saved places as a native datalist: typing offers them,
 * anything else is still allowed. Render once per form.
 */
export function PlacesDatalist({ places }: { places: Place[] }) {
  if (places.length === 0) return null;
  return (
    <datalist id={PLACES_LIST_ID}>
      {places.map((p) => (
        <option key={p.id} value={p.name} />
      ))}
    </datalist>
  );
}
