/**
 * Central brand palette — Addax Petroleum (primary customer).
 *
 * The web UI is themed via CSS variables in globals.css. This module mirrors the
 * same palette as plain hex for contexts where CSS vars don't apply: chart
 * libraries, server-rendered PDF/Excel reports, email templates, etc.
 *
 * ⚠️ The red is an approximation of the Addax brand red. Replace `red` with the
 * exact hex from Addax's official brand guidelines when available — this single
 * source then propagates to every report and chart.
 *
 * Architecture note: per-tenant branding is also stored in `tenants.settings`
 * (JSONB, key `branding`). When the portal serves multiple customers, resolve
 * the active tenant's branding at request time and fall back to this default.
 */

export interface BrandPalette {
  /** Display name of the brand/company. */
  name: string;
  /** Primary brand color (Addax red). */
  red: string;
  redDark: string;
  redTint: string;
  charcoal: string;
  slate: string;
  background: string;
  /** Ordered series colors for charts (primary first). */
  chartSeries: string[];
}

export const ADDAX_BRAND: BrandPalette = {
  name: "Addax Petroleum",
  red: "#E2001A",
  redDark: "#AE0014",
  redTint: "#FDE7EA",
  charcoal: "#1F1F1F",
  slate: "#525252",
  background: "#FFFFFF",
  chartSeries: ["#E2001A", "#1F1F1F", "#9A1B2F", "#6B7280", "#E58A93", "#3F3F46"],
};

/** The brand applied by default across the portal until per-tenant overrides. */
export const DEFAULT_BRAND = ADDAX_BRAND;
