// Sidebar submenu + view resolution for the Fitness to Work & Medical module.
// One route (/medical) with `?view=` sub-views, like the offshore/training
// modules: "mine" (the employee's own confidential status) and "admin" (the
// roster + record management, admins only).

export type MedicalView = "mine" | "admin" | "planner";

export function resolveMedicalView(raw: string | null | undefined, isAdmin: boolean): MedicalView {
  if (raw === "admin" && isAdmin) return "admin";
  if (raw === "planner" && isAdmin) return "planner";
  return "mine";
}

export interface MedicalNavItem {
  key: MedicalView;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

export function medicalSubmenu(opts: { isAdmin: boolean }): MedicalNavItem[] {
  const items: MedicalNavItem[] = [
    { key: "mine", label: "My Status", icon: "HeartPulse", href: "/medical?view=mine" },
  ];
  if (opts.isAdmin) {
    items.push({ key: "admin", label: "Administration", icon: "Stethoscope", href: "/medical?view=admin" });
    items.push({ key: "planner", label: "Plan Campaign", icon: "CalendarClock", href: "/medical?view=planner" });
  }
  return items;
}
