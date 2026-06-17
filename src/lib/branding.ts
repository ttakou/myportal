import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BRAND } from "@/lib/brand";

/**
 * Per-tenant branding.
 *
 * Branding is stored in `tenants.settings.branding` (JSONB). At request time we
 * resolve the signed-in user's tenant (RLS scopes the query to their tenant),
 * convert the brand hex values into the HSL triplets the theme's CSS variables
 * expect, and inject them on the portal layout so each customer sees their own
 * colors. Tenants without branding fall back to DEFAULT_BRAND.
 */

export interface TenantBranding {
  name: string;
  /** Primary brand color as hex (e.g. "#E2001A"). */
  primary: string;
  /** Darker primary for hover/active, as hex. */
  primaryDark: string;
  /** Neutral charcoal as hex. */
  charcoal: string;
  /** Optional logo image URL (static asset path or uploaded URL). */
  logoUrl: string | null;
}

// ---------------------------------------------------------------------------
// Color helpers: hex -> "H S% L%" (the format Tailwind's hsl(var(--x)) needs)
// ---------------------------------------------------------------------------
function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/** Returns "H S% L%" for use in CSS custom properties, or null if hex is invalid. */
function hexToHslParts(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return { h, s, l };
}

const hsl = ({ h, s, l }: { h: number; s: number; l: number }) =>
  `${h} ${s}% ${l}%`;

/** WCAG-ish: pick white or near-black foreground for a given hex background. */
function readableForeground(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "0 0% 100%";
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "0 0% 9%" : "0 0% 100%";
}

// ---------------------------------------------------------------------------
// Resolve branding for the current tenant
// ---------------------------------------------------------------------------
export async function getTenantBranding(): Promise<TenantBranding> {
  const fallback: TenantBranding = {
    name: DEFAULT_BRAND.name,
    primary: DEFAULT_BRAND.red,
    primaryDark: DEFAULT_BRAND.redDark,
    charcoal: DEFAULT_BRAND.charcoal,
    logoUrl: null,
  };

  try {
    const supabase = createClient();
    // RLS scopes this to the signed-in user's tenant.
    const { data } = await supabase
      .from("tenants")
      .select("name, settings")
      .limit(1)
      .maybeSingle();

    if (!data) return fallback;

    const branding = (data.settings as { branding?: Partial<TenantBranding> })
      ?.branding;

    return {
      name: branding?.name ?? data.name ?? fallback.name,
      primary: branding?.primary ?? fallback.primary,
      primaryDark: branding?.primaryDark ?? fallback.primaryDark,
      charcoal: branding?.charcoal ?? fallback.charcoal,
      logoUrl: branding?.logoUrl ?? fallback.logoUrl,
    };
  } catch {
    return fallback;
  }
}

/**
 * Resolve branding for a tenant by its subdomain slug, WITHOUT a signed-in user.
 * Backed by the `tenant_public_branding` SECURITY DEFINER RPC (anon-callable,
 * exact-slug only). Returns null when the slug is unknown so callers can fall
 * back to the default brand. Used by the pre-auth login page.
 */
export async function getTenantBrandingBySlug(
  slug: string | null | undefined,
): Promise<TenantBranding | null> {
  if (!slug) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase.rpc("tenant_public_branding", { p_slug: slug });
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          name?: string;
          logo_url?: string | null;
          primary_color?: string | null;
          primary_dark?: string | null;
          charcoal?: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      name: row.name ?? DEFAULT_BRAND.name,
      primary: row.primary_color ?? DEFAULT_BRAND.red,
      primaryDark: row.primary_dark ?? DEFAULT_BRAND.redDark,
      charcoal: row.charcoal ?? DEFAULT_BRAND.charcoal,
      logoUrl: row.logo_url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Convert resolved branding into the CSS-variable overrides the theme consumes.
 * Returned as a style object to spread onto a layout wrapper; it overrides the
 * defaults declared in globals.css for everything nested inside.
 */
export function brandingToCssVars(branding: TenantBranding): CSSProperties {
  const primary = hexToHslParts(branding.primary) ?? { h: 353, s: 100, l: 44 };
  const primaryDark =
    hexToHslParts(branding.primaryDark) ?? { h: 353, s: 100, l: 34 };
  const charcoal = hexToHslParts(branding.charcoal) ?? { h: 0, s: 0, l: 12 };

  const vars: Record<string, string> = {
    "--primary": hsl(primary),
    "--primary-foreground": readableForeground(branding.primary),
    "--ring": hsl(primary),
    // Light tint of the primary hue for hover/selected surfaces.
    "--accent": `${primary.h} ${Math.min(primary.s, 100)}% 96%`,
    "--accent-foreground": `${primary.h} 80% 32%`,
    "--brand-red": hsl(primary),
    "--brand-red-dark": hsl(primaryDark),
    "--brand-charcoal": hsl(charcoal),
  };

  return vars as CSSProperties;
}
