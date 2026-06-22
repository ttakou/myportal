// Performance module sidebar submenu + appraisal view keys. The submenu mixes
// plain routes (home, settings) with `?view=` views on /performance/appraisals,
// so each item carries a full href; the sidebar matches the active one.

export type AppraisalViewKey = "mine" | "team" | "hr";

export const APPRAISAL_VIEW_KEYS: AppraisalViewKey[] = ["mine", "team", "hr"];
export const DEFAULT_APPRAISAL_VIEW: AppraisalViewKey = "mine";

export interface PerfNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

/** Sidebar submenu, role-aware. Everyone gets home + their own appraisal. */
export function performanceSubmenu(opts: { isHr: boolean; isManager: boolean }): PerfNavItem[] {
  const items: PerfNavItem[] = [
    { key: "home", label: "My performance", icon: "Gauge", href: "/performance" },
    { key: "mine", label: "My appraisal", icon: "ClipboardCheck", href: "/performance/appraisals?view=mine" },
    { key: "continuous", label: "Continuous", icon: "Sparkles", href: "/performance/continuous" },
  ];
  if (opts.isManager || opts.isHr) {
    items.push({ key: "team", label: "Team review", icon: "Users", href: "/performance/appraisals?view=team" });
  }
  if (opts.isHr) {
    items.push({ key: "hr", label: "HR console", icon: "LayoutGrid", href: "/performance/appraisals?view=hr" });
    items.push({ key: "settings", label: "Performance settings", icon: "Settings", href: "/performance/settings" });
  }
  return items;
}

/** Resolve a raw `?view=` value to a known appraisal view, else the default. */
export function resolveAppraisalView(raw: string | null | undefined): AppraisalViewKey {
  return raw && (APPRAISAL_VIEW_KEYS as string[]).includes(raw)
    ? (raw as AppraisalViewKey)
    : DEFAULT_APPRAISAL_VIEW;
}
