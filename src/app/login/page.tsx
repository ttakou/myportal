import { Suspense } from "react";
import { getCurrentTenantSlug } from "@/lib/tenant";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  // Tenant implied by the subdomain (e.g. acme-oil.mportals.com). Pre-auth
  // context only — shows which workspace you're signing in to.
  const tenantSlug = getCurrentTenantSlug();

  return (
    <Suspense>
      <LoginForm tenantSlug={tenantSlug} />
    </Suspense>
  );
}
