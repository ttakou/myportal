// Admin Console: a single hub for every module's administration. The console
// owns the cross-cutting "core" admin areas as `?view=` sections (people, roles,
// modules, settings, audit); each subscribed module's own admin area is surfaced
// as a card on the Overview that links out to it (the "hub" model). Access is
// tiered — system admins see the core sections; a module's admin (e.g. a
// Training Admin, Canteen Manager) reaches the console and sees that module's
// card, gated exactly as the destination page already gates itself.

export type AdminView = "overview" | "people" | "roles" | "modules" | "settings" | "audit";

const CORE_VIEWS: AdminView[] = ["people", "roles", "modules", "settings", "audit"];

export interface AdminFlags {
  isSystemAdmin: boolean;
  isHr: boolean;
  isCanteenManager: boolean;
  isTrainingAdmin: boolean;
  canManageOffshore: boolean;
  isFinance: boolean;
  isSafetyAdmin: boolean;
  isOrgAdmin: boolean; // tenant or system admin (medical/savings/visitors admin)
  canMuster: boolean;
}

/** Whether the user can open the Admin Console at all (any admin capability). */
export function canSeeAdminConsole(f: AdminFlags): boolean {
  return (
    f.isSystemAdmin ||
    f.isOrgAdmin ||
    f.isHr ||
    f.isCanteenManager ||
    f.isTrainingAdmin ||
    f.canManageOffshore ||
    f.isFinance ||
    f.isSafetyAdmin ||
    f.canMuster
  );
}

export function resolveAdminView(raw: string | null | undefined, f: AdminFlags): AdminView {
  if (raw === "people" && (f.isSystemAdmin || f.isHr)) return "people";
  if (raw && (CORE_VIEWS as string[]).includes(raw) && f.isSystemAdmin) return raw as AdminView;
  return "overview";
}

export interface AdminNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

/** Sidebar submenu: the core console sections, gated by capability. Module admin
 *  areas live as cards on the Overview rather than cluttering the submenu. */
export function adminSubmenu(f: AdminFlags): AdminNavItem[] {
  const items: AdminNavItem[] = [
    { key: "overview", label: "Overview", icon: "LayoutDashboard", href: "/admin?view=overview" },
  ];
  if (f.isSystemAdmin || f.isHr) items.push({ key: "people", label: "People", icon: "Users", href: "/admin?view=people" });
  if (f.isSystemAdmin) {
    items.push({ key: "roles", label: "Access Roles", icon: "ShieldCheck", href: "/admin?view=roles" });
    items.push({ key: "modules", label: "Modules", icon: "Boxes", href: "/admin?view=modules" });
    items.push({ key: "settings", label: "Settings & Branding", icon: "Settings", href: "/admin?view=settings" });
    items.push({ key: "audit", label: "Audit Log", icon: "ScrollText", href: "/admin?view=audit" });
  }
  return items;
}

export interface ModuleAdminLink {
  key: string;
  label: string;
  description: string;
  icon: string;
  href: string;
}

/** Each subscribed module's admin destination, filtered to what the user may run.
 *  `activeSlugs` keeps the cards to modules the tenant actually has enabled. */
export function moduleAdminLinks(f: AdminFlags, activeSlugs: string[]): ModuleAdminLink[] {
  const has = (slug: string) => activeSlugs.includes(slug);
  const all: (ModuleAdminLink & { show: boolean; slug: string })[] = [
    { slug: "canteen", show: f.isCanteenManager, key: "canteen", label: "Canteen", description: "Menus, forecast, campboss & entitlements", icon: "UtensilsCrossed", href: "/canteen/manage" },
    { slug: "training", show: f.isTrainingAdmin, key: "training", label: "Training & Competence", description: "Catalogue, assignments, approvals & reports", icon: "GraduationCap", href: "/training?view=assign" },
    { slug: "performance", show: f.isHr, key: "performance", label: "Performance", description: "Cycles, scales, calibration & settings", icon: "TrendingUp", href: "/performance/settings" },
    { slug: "offshore", show: f.canManageOffshore, key: "offshore", label: "Offshore", description: "Trips, crews, manifests & POB", icon: "Ship", href: "/offshore" },
    { slug: "visitors", show: f.isOrgAdmin || f.canMuster, key: "visitors", label: "Visitor Management", description: "Reception, hosting & muster roll", icon: "Users", href: "/visitors" },
    { slug: "medical", show: f.isOrgAdmin, key: "medical", label: "Fitness to Work & Medical", description: "Roster & medical records", icon: "HeartPulse", href: "/medical?view=admin" },
    { slug: "savings", show: f.isOrgAdmin, key: "savings", label: "Employees Saving", description: "Accounts, contributions & loans", icon: "Wallet", href: "/savings?view=admin" },
    { slug: "emergency", show: f.isSafetyAdmin, key: "emergency", label: "Emergency Support", description: "Command centre & incident history", icon: "Siren", href: "/emergency/command" },
  ];
  return all.filter((m) => m.show && has(m.slug)).map(({ show: _show, slug: _slug, ...rest }) => rest);
}
