import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";
import { getCurrentTenantSlug } from "@/lib/tenant";
import { brandingToCssVars, getTenantBrandingBySlug } from "@/lib/branding";
import { PendingActions } from "./_components/pending-actions";

/**
 * Awaiting-access screen for a signed-in user who has no organisation yet
 * (a fresh sign-up or SSO first login). The middleware routes every tenant-less
 * user here; onboarded users are redirected back to the dashboard.
 */
export default async function PendingPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, tenant_id, access_requested_at")
    .eq("id", user.id)
    .maybeSingle();

  // Onboarded (or super admin) — nothing to wait for.
  if (profile && (profile.tenant_id != null || profile.role === "super_admin")) {
    redirect("/dashboard");
  }

  const tenantSlug = getCurrentTenantSlug();
  const branding = await getTenantBrandingBySlug(tenantSlug);
  const cssVars = branding ? (brandingToCssVars(branding) as CSSProperties) : undefined;
  const email = profile?.email ?? user.email ?? "";

  return (
    <main
      style={cssVars}
      className="flex min-h-screen items-center justify-center bg-muted/30 p-4"
    >
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.name ?? "Logo"}
              className="h-14 w-auto object-contain"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="h-7 w-7" />
            </span>
          )}
          <h1 className="text-xl font-semibold tracking-tight">Your account is awaiting access</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in{branding?.name ? ` to ${branding.name}` : ""}, but your account
            isn&apos;t linked to an organisation yet. An administrator needs to grant you access
            before you can use the portal.
          </p>
        </div>

        <dl className="space-y-1 rounded-lg bg-muted/50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Signed in as</dt>
            <dd className="truncate font-medium">{profile?.full_name || email || "—"}</dd>
          </div>
          {email && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate font-medium">{email}</dd>
            </div>
          )}
        </dl>

        <PendingActions alreadyRequested={profile?.access_requested_at != null} />

        <p className="text-center text-xs text-muted-foreground">
          If you reached this by mistake, or used the wrong email, sign out and try again with your
          work account.
        </p>
      </div>
    </main>
  );
}
