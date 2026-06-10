import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared layout for all authenticated portal pages (dashboard + every module).
 * Renders the data-driven sidebar alongside page content. Module pages added in
 * later sprints live under this route group and inherit the sidebar for free.
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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="container py-8">{children}</div>
      </main>
    </div>
  );
}
