import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getAccounts, getMyAccount } from "@/lib/savings";
import { getTenantUsers } from "@/lib/admin";
import { money, type SavingsTxn } from "@/types/savings";
import { cn } from "@/lib/utils";
import { SavingsAdmin } from "./_components/savings-admin";
import { resolveSavingsView } from "./_components/savings-views";

export default async function SavingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [access, role] = await Promise.all([getAccess(), getCurrentRole()]);
  const isAdmin = isAdminRole(role);
  const view = resolveSavingsView((await searchParams).view, isAdmin);
  const [mine, accounts, users] = await Promise.all([
    getMyAccount(),
    isAdmin && view === "admin" ? getAccounts() : Promise.resolve([]),
    isAdmin && view === "admin" ? getTenantUsers() : Promise.resolve([]),
  ]);

  if (view === "admin") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees Saving Management</h1>
          <p className="text-muted-foreground">Accounts, contributions and loan management.</p>
        </div>
        <SavingsAdmin
          accounts={accounts}
          users={users.map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employees Saving Management</h1>
        <p className="text-muted-foreground">Cooperative fund, ledger and loans.</p>
        {(access.isFinance || access.isAdmin) && (
          <Link
            href="/reports/loan-arrears"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <FileBarChart className="h-4 w-4" /> Savings &amp; loan arrears report
          </Link>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-5 md:col-span-1">
          <p className="text-sm text-muted-foreground">My savings balance</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {money(mine?.balance ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5 md:col-span-2">
          <p className="mb-2 text-sm font-medium">My loans</p>
          {mine && mine.loans.length > 0 ? (
            <div className="space-y-1 text-sm">
              {mine.loans.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span>
                    {money(l.principal)} @ {(l.annual_rate * 100).toFixed(1)}% · {l.term_months}mo ·{" "}
                    {money(l.monthly_payment)}/mo
                  </span>
                  <span className={cn(l.status === "closed" ? "text-green-600" : "text-muted-foreground")}>
                    {l.status === "closed" ? "Paid off" : `${money(l.outstanding)} left`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active loans.</p>
          )}
        </div>
      </div>

      {mine && mine.transactions.length > 0 && <Ledger txns={mine.transactions} />}
    </div>
  );
}

function Ledger({ txns }: { txns: SavingsTxn[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">My ledger</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Note</th><th className="px-4 py-3 font-medium text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y">
            {txns.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 capitalize">{t.kind}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.note ?? "—"}</td>
                <td className={cn("px-4 py-3 text-right tabular-nums", t.kind === "contribution" ? "text-green-600" : "text-destructive")}>
                  {t.kind === "contribution" ? "+" : "−"}{money(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
