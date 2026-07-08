"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileBarChart, LayoutDashboard, Menu, UserCog, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Primary destinations for the mobile bottom tab bar. The "Menu" tab opens the
 *  full sidebar drawer, since modules are dynamic and too many for fixed tabs. */
const BOTTOM_TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/account", label: "Account", icon: UserCog },
] as const;

/**
 * Responsive app shell. On desktop the sidebar is static; on mobile it becomes
 * a slide-in drawer toggled from the header, so the UI fits any screen size.
 */
export function PortalShell({
  sidebar,
  header,
  brandName,
  logoUrl,
  children,
}: {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  brandName?: string;
  logoUrl?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden md:block print:hidden">{sidebar}</div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full">{sidebar}</div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute left-[16.5rem] top-3 grid h-9 w-9 place-items-center rounded-md bg-card text-foreground shadow"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top navbar. Sticky so it stays put in the standalone PWA, with
            safe-area padding so it clears the status bar / notch. The brand
            shows on mobile only (the desktop sidebar already carries it). */}
        <header
          className="flex items-center gap-3 border-b bg-card px-4 print:hidden sm:px-6"
          style={{
            height: "calc(4rem + env(safe-area-inset-top))",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={brandName ?? "Home"} className="h-8 w-auto max-w-[150px] object-contain" />
            ) : (
              <span className="truncate text-base font-semibold tracking-tight text-brand">
                {brandName ?? "Portal"}
              </span>
            )}
          </Link>
          <div className="ml-auto">{header}</div>
        </header>
        <main className="flex-1 overflow-y-auto bg-background">
          {/* Extra bottom padding on mobile so the fixed tab bar never covers content. */}
          <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-8 md:pb-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar (PWA primary nav). Hidden on desktop where the
          static sidebar is always visible. Honours the home-indicator safe area. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card md:hidden print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {BOTTOM_TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
