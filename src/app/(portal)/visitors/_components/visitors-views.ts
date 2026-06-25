// Sidebar submenu for the Visitor Management module. Real routes, matched by
// pathname. The muster roll is for whoever runs an evacuation (admins, security
// / reception, emergency responders — i.e. visitors:operate), mirroring the
// gating on the muster page.

export interface VisitorsNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

export function visitorsSubmenu(opts: { canMuster: boolean }): VisitorsNavItem[] {
  const items: VisitorsNavItem[] = [
    { key: "reception", label: "Visitor Management", icon: "Users", href: "/visitors" },
  ];
  if (opts.canMuster) {
    items.push({ key: "muster", label: "Muster Roll", icon: "ClipboardList", href: "/visitors/muster" });
  }
  return items;
}
