// Sidebar submenu + view resolution for the Employees Saving module. One route
// (/savings) with `?view=` sub-views — "mine" (balance, interest, ledger) and
// "admin" (accounts, interest, contributions & withdrawals, admins only) — plus
// a link to the printable account statement.

export type SavingsView = "mine" | "admin";

export function resolveSavingsView(raw: string | null | undefined, isAdmin: boolean): SavingsView {
  if (raw === "admin" && isAdmin) return "admin";
  return "mine";
}

export interface SavingsNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
}

export function savingsSubmenu(opts: { isAdmin: boolean }): SavingsNavItem[] {
  const items: SavingsNavItem[] = [
    { key: "mine", label: "My Savings", icon: "Wallet", href: "/savings?view=mine" },
    { key: "statement", label: "Account Statement", icon: "FileText", href: "/savings/statement" },
  ];
  if (opts.isAdmin) {
    items.push({ key: "admin", label: "Administration", icon: "Settings", href: "/savings?view=admin" });
  }
  return items;
}
