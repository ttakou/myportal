// Sidebar submenu + view resolution for the Employees Saving module. One route
// (/savings) with `?view=` sub-views — "mine" (balance, interest, ledger) and
// "admin" (accounts, interest, contributions & withdrawals, admins only) — plus
// a link to the printable account statement.

export type SavingsView = "mine" | "forecast" | "admin" | "approvals";

export function resolveSavingsView(
  raw: string | null | undefined,
  opts: { isAdmin: boolean; isApprover: boolean },
): SavingsView {
  if (raw === "admin" && opts.isAdmin) return "admin";
  if (raw === "approvals" && opts.isApprover) return "approvals";
  if (raw === "forecast") return "forecast";
  return "mine";
}

export interface SavingsNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

export function savingsSubmenu(opts: { isAdmin: boolean; isApprover: boolean }): SavingsNavItem[] {
  const items: SavingsNavItem[] = [
    { key: "mine", label: "My Savings", icon: "Wallet", href: "/savings?view=mine" },
    { key: "forecast", label: "Savings Forecast", icon: "TrendingUp", href: "/savings?view=forecast" },
    { key: "statement", label: "Account Statement", icon: "FileText", href: "/savings/statement" },
  ];
  if (opts.isApprover) {
    items.push({ key: "approvals", label: "My Approvals", icon: "ClipboardCheck", href: "/savings?view=approvals" });
  }
  if (opts.isAdmin) {
    items.push({ key: "admin", label: "Administration", icon: "Settings", href: "/savings?view=admin" });
  }
  return items;
}
