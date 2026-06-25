// Single source of truth for the canteen module's sidebar submenu. Like the
// performance module, the canteen sub-areas are real routes (not `?view=`
// views), so each item carries a full href and the sidebar matches the active
// one by pathname. The submenu is role-aware and mirrors the access gating on
// each canteen page (see src/app/(portal)/canteen/**/page.tsx).

export interface CanteenNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

/**
 * Ordered, role-aware submenu. Everyone with the module sees the menu, history
 * and feedback; the operational and management areas are added per role:
 *  - canServe   (canteen staff)            → serving point + meal serving
 *  - canManage  (canteen manager)          → manage menu, campboss, forecast
 *  - canEntitle (HR)                       → entitlements
 *  - canReport  (finance / canteen manager)→ reports
 */
export function canteenSubmenu(opts: {
  canServe: boolean;
  canManage: boolean;
  canEntitle: boolean;
  canReport: boolean;
  isOim: boolean;
}): CanteenNavItem[] {
  const items: CanteenNavItem[] = [
    { key: "menu", label: "Today's menu", icon: "UtensilsCrossed", href: "/canteen" },
    { key: "history", label: "Lunch history", icon: "History", href: "/canteen/history" },
    { key: "feedback", label: "Feedback", icon: "MessageSquare", href: "/canteen/feedback" },
  ];
  if (opts.canServe) {
    items.push({ key: "serving", label: "Serving point", icon: "ScanLine", href: "/canteen/serving" });
    items.push({ key: "redeem", label: "Meal serving", icon: "Utensils", href: "/canteen/redeem" });
  }
  if (opts.canManage) {
    items.push({ key: "manage", label: "Manage menu", icon: "Settings", href: "/canteen/manage" });
    items.push({ key: "campboss", label: "Campboss dashboard", icon: "LayoutDashboard", href: "/canteen/campboss" });
    items.push({ key: "forecast", label: "Forecast", icon: "TrendingUp", href: "/canteen/forecast" });
  }
  if (opts.canEntitle) {
    items.push({ key: "entitlements", label: "Entitlements", icon: "Users", href: "/canteen/entitlements" });
  }
  if (opts.canReport) {
    items.push({ key: "reports", label: "Reports", icon: "BarChart3", href: "/canteen/reports" });
  }
  // Cross-module canteen reports (previously buttons on the menu page).
  if (opts.canReport || opts.isOim) {
    items.push({ key: "consumption", label: "Consumption report", icon: "BarChart3", href: "/reports/canteen" });
  }
  if (opts.canEntitle || opts.canManage) {
    items.push({ key: "feedback-report", label: "Feedback report", icon: "MessageSquareText", href: "/reports/canteen-feedback" });
  }
  items.push({ key: "my-meals", label: "My meals", icon: "ClipboardList", href: "/reports/my-meals" });
  return items;
}
