// Sidebar submenu for the Emergency Support module. Real routes (not ?view=),
// matched by pathname. The command centre + incident history are safety-admin
// only, mirroring the gating on those pages.

export interface EmergencyNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

export function emergencySubmenu(opts: { canCommand: boolean }): EmergencyNavItem[] {
  const items: EmergencyNavItem[] = [
    { key: "overview", label: "Emergency Support", icon: "LifeBuoy", href: "/emergency" },
  ];
  if (opts.canCommand) {
    items.push({ key: "command", label: "Command Centre", icon: "ShieldAlert", href: "/emergency/command" });
    items.push({ key: "history", label: "Incident History", icon: "History", href: "/emergency/command/history" });
  }
  return items;
}
