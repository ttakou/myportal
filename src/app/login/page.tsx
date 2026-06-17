import { Suspense } from "react";
import type { CSSProperties } from "react";
import { getCurrentTenantSlug } from "@/lib/tenant";
import { brandingToCssVars, getTenantBrandingBySlug } from "@/lib/branding";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Tenant implied by the subdomain (e.g. acme-oil.mportals.com). Pre-auth
  // context only — shows which workspace you're signing in to, and (when the
  // tenant has branding) its name, logo and colours.
  const tenantSlug = getCurrentTenantSlug();
  const branding = await getTenantBrandingBySlug(tenantSlug);
  const cssVars = branding ? (brandingToCssVars(branding) as CSSProperties) : undefined;

  return (
    <Suspense>
      <LoginForm
        tenantSlug={tenantSlug}
        brandName={branding?.name ?? null}
        logoUrl={branding?.logoUrl ?? null}
        cssVars={cssVars}
      />
    </Suspense>
  );
}
