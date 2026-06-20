/** Great-circle distance between two lat/lng points, in metres (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000; // Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Geofence = { lat: number; lng: number; radiusM: number };

/**
 * The site (Addax base) geofence used for the "I'm in" self check-in, read from
 * server env so it can be set per deployment without code changes:
 *   ADDAX_BASE_LAT, ADDAX_BASE_LNG  — centre coordinates (decimal degrees)
 *   ADDAX_BASE_RADIUS_M             — radius in metres (defaults to 1000 = 1 km)
 * Returns null when coordinates are not configured.
 */
export function getBaseGeofence(): Geofence | null {
  const lat = Number(process.env.ADDAX_BASE_LAT);
  const lng = Number(process.env.ADDAX_BASE_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const radiusM = Number(process.env.ADDAX_BASE_RADIUS_M);
  return { lat, lng, radiusM: Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 1000 };
}

/** Human-friendly distance for guidance messages. */
export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
