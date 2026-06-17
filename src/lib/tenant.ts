import { headers, type UnsafeUnwrappedHeaders } from "next/headers";
import { resolveTenantSlug } from "@/lib/tenant-domain";

export { RESERVED_SUBDOMAINS, ROOT_DOMAIN, resolveTenantSlug } from "@/lib/tenant-domain";

/**
 * Read the tenant slug implied by the current request's subdomain. Call from
 * Server Components, Route Handlers, or Server Actions. Returns `null` on the
 * root domain (no tenant in scope).
 *
 * This is request context, not access control — it does not change which
 * tenant's data the user can see. That remains RLS's job (`current_tenant_id()`).
 *
 * `headers()` is synchronous on Next 14.
 */
export function getCurrentTenantSlug(): string | null {
  const h = (headers() as unknown as UnsafeUnwrappedHeaders);
  // On Vercel the original host arrives as `x-forwarded-host`.
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return resolveTenantSlug(host);
}
