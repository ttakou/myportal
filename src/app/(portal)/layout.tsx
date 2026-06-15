import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
import { getTenantBranding, brandingToCssVars } from "@/lib/branding";
import { getMyNotifications } from "@/lib/notifications";
import { UserMenu } from "./_components/user-menu";
import { NotificationBell } from "./_components/notification-bell";
import { PortalShell } from "./_components/portal-shell";
import { ImpersonationBanner } from "./_components/impersonation-banner";

/**
 * Shared layout for all authenticated portal pages (dashboard + every module).
 * Renders the data-driven sidebar alongside page content. Module pages added in
 * later sprints live under this route group and inherit the sidebar for free.
 *
 * Branding is resolved per tenant and injected as CSS-variable overrides on the
 * wrapper, so every customer sees their own colors without code changes.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth — middleware already guards this, but never trust a single layer.
  if (!user) {
    redirect("/login");
  }

  const [branding, profile, notifications] = await Promise.all([
    getTenantBranding(),
    supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .maybeSingle()
      .then((r) => r.data),
    getMyNotifications(),
  ]);

  const displayName = profile?.full_name || profile?.email || "User";
  const role = profile?.role ?? "employee";
  const impersonating = cookies().get("imp_active")?.value;

  return (
    <div style={brandingToCssVars(branding)}>
      {impersonating && <ImpersonationBanner name={displayName} />}
      <PortalShell
        sidebar={<Sidebar brandName={branding.name} logoUrl={branding.logoUrl} />}
        header={
          <div className="flex items-center gap-1">
            <NotificationBell initial={notifications} />
            <UserMenu name={displayName} role={role} />
          </div>
        }
      >
        {children}
      </PortalShell>
    </div>
  );
}
