import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
import { getTenantBranding, brandingToCssVars } from "@/lib/branding";
import { UserMenu } from "./_components/user-menu";

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

  const [branding, profile] = await Promise.all([
    getTenantBranding(),
    supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  const displayName = profile?.full_name || profile?.email || "User";
  const role = profile?.role ?? "employee";

  return (
    <div className="flex min-h-screen" style={brandingToCssVars(branding)}>
      <Sidebar brandName={branding.name} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-end border-b bg-card px-6">
          <UserMenu name={displayName} role={role} />
        </header>
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="container py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
