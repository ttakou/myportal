/**
 * How a saved manifest describes itself.
 *
 * The stored `title` cannot be trusted: it was baked at creation by more than
 * one code path, and production holds rows where a `direction: "out"` manifest
 * is titled "outbound" and another is titled "inbound". It also predates the
 * transport mode on some rows. Everything here is therefore derived from the
 * manifest's own columns, so a reviewer reads the data rather than a stale
 * string.
 *
 * The wording deliberately avoids "inbound/outbound" — sites use those words in
 * opposite senses. MOB and DEMOB are unambiguous offshore, and the route says
 * which way in plain terms.
 */

export type ManifestDirection = "out" | "in";

export interface LabelledManifest {
  direction: ManifestDirection;
  transport_mode: string | null;
  scheduled_date: string;
  crew_name?: string | null;
  installation_name?: string | null;
}

export interface ManifestDescriptor {
  /** MOB = joining the installation; DEMOB = leaving it. */
  movement: "MOB" | "DEMOB";
  /** Long form for tooltips and print. */
  movementLong: string;
  /** "Helicopter" | "Boat" | "Transport not set". */
  transport: string;
  /** "Shore → Juliet" / "Juliet → Shore". */
  route: string;
  /** The crew-change date this manifest runs on. */
  date: string;
  /** One-line summary for a card heading. */
  summary: string;
}

function transportLabel(mode: string | null): string {
  if (mode === "helicopter") return "Helicopter";
  if (mode === "boat") return "Boat";
  return "Transport not set";
}

export function manifestDescriptor(m: LabelledManifest): ManifestDescriptor {
  const mob = m.direction === "out";
  // Falls back to a generic word rather than an empty side, so the route always
  // reads as a direction — most manifests carry no installation.
  const place = m.installation_name?.trim() || "Installation";
  const movement = mob ? "MOB" : "DEMOB";
  const parts = [
    m.crew_name?.trim() || null,
    movement,
    transportLabel(m.transport_mode),
    mob ? `Shore → ${place}` : `${place} → Shore`,
    m.scheduled_date,
  ].filter(Boolean) as string[];

  return {
    movement,
    movementLong: mob ? "Mobilisation — joining the installation" : "Demobilisation — leaving the installation",
    transport: transportLabel(m.transport_mode),
    route: mob ? `Shore → ${place}` : `${place} → Shore`,
    date: m.scheduled_date,
    summary: parts.join(" · "),
  };
}
