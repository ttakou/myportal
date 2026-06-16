/**
 * Tenant ↔ host resolution.
 *
 * Pure and dependency-free: safe to import anywhere (no `next/*`, no DB). Maps a
 * request's subdomain to a `tenants.slug` (e.g. `acme-oil.mportals.com` →
 * `acme-oil`). The slug is only a *hint* about which tenant a visitor is looking
 * at — actual data isolation stays with RLS / `current_tenant_id()`.
 */

/** Subdomains that are part of the product itself, never a tenant. */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "auth",
]);

/**
 * The app's root domain, without port — e.g. "mportals.com" in production or
 * "localhost" in development. Configure via `NEXT_PUBLIC_ROOT_DOMAIN`.
 */
export const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost"
)
  .split(":")[0]
  .toLowerCase();

/**
 * Resolve a tenant slug from a `Host` header value. Returns `null` for the root
 * domain and reserved subdomains. With rootDomain "mportals.com":
 *   "acme-oil.mportals.com" → "acme-oil"
 *   "mportals.com"          → null
 *   "www.mportals.com"      → null  (reserved)
 *   "acme.localhost:3000"   → "acme" (with rootDomain "localhost")
 *   "evil.example.com"      → null  (not our domain)
 */
export function resolveTenantSlug(
  host: string | null | undefined,
  rootDomain: string = ROOT_DOMAIN,
): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();

  if (hostname === rootDomain) return null;

  const suffix = `.${rootDomain}`;
  if (!hostname.endsWith(suffix)) return null;

  // Left-most label, so "a.b.mportals.com" → "a". Hyphens are kept (acme-oil).
  const subdomain = hostname.slice(0, -suffix.length).split(".")[0];
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) return null;

  return subdomain;
}
