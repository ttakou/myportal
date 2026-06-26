import Link from "next/link";
import { FileText } from "lucide-react";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getAccounts,
  getImportBatches,
  getMyAccount,
  getMyApprovalHistory,
  getMyPendingImportApprovals,
  getMyWithdrawalRequests,
  getSavingsAuditLog,
  getSavingsConfig,
  getSavingsImportSteps,
  getWithdrawalRequests,
  isSavingsApprover,
} from "@/lib/savings";
import { getTenantUsers } from "@/lib/admin";
import { isCredit, money, type SavingsTxn } from "@/types/savings";
import { cn } from "@/lib/utils";
import { SavingsAdmin } from "./_components/savings-admin";
import { SavingsAuditPanel } from "./_components/savings-audit-panel";
import { SavingsApprovalsView } from "./_components/savings-approvals-view";
import { WithdrawalRequestPanel } from "./_components/withdrawal-request-panel";
import { ImportApprovalsInbox } from "./_components/import-approvals-inbox";
import { resolveSavingsView } from "./_components/savings-views";

export default async function SavingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [access, role] = await Promise.all([getAccess(), getCurrentRole()]);
  // Mirror the sidebar/console gate (isOrgAdmin): the system_admin functional
  // role counts as admin, so the Administration nav and the page agree.
  const isAdmin = isAdminRole(role) || access.isSystemAdmin;
  const isApprover = await isSavingsApprover();
  const view = resolveSavingsView((await searchParams).view, { isAdmin, isApprover });
  const isAdminView = isAdmin && view === "admin";
  const isApprovalsView = view === "approvals";

  if (isApprovalsView) {
    const history = await getMyApprovalHistory();
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Approvals</h1>
          <p className="text-muted-foreground">Every savings decision you have made.</p>
        </div>
        <SavingsApprovalsView items={history} />
      </div>
    );
  }

  const [mine, myWithdrawals, config, pendingApprovals, accounts, users, withdrawals, importSteps, batches, audit] =
    await Promise.all([
      getMyAccount(),
      getMyWithdrawalRequests(),
      getSavingsConfig(),
      getMyPendingImportApprovals(),
      isAdminView ? getAccounts() : Promise.resolve([]),
      isAdminView ? getTenantUsers() : Promise.resolve([]),
      isAdminView ? getWithdrawalRequests() : Promise.resolve([]),
      isAdminView ? getSavingsImportSteps() : Promise.resolve([]),
      isAdminView ? getImportBatches() : Promise.resolve([]),
      isAdminView ? getSavingsAuditLog() : Promise.resolve([]),
    ]);

  if (view === "admin") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees Saving Management</h1>
          <p className="text-muted-foreground">Accounts, contributions, interest and withdrawals.</p>
        </div>
        <SavingsAdmin
          accounts={accounts}
          users={users.map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))}
          withdrawals={withdrawals}
          annualRatePct={config.annualRatePct}
          importSteps={importSteps}
          batches={batches}
        />
        <SavingsAuditPanel entries={audit} />
      </div>
    );
  }

  const interestToDate = (mine?.transactions ?? [])
    .filter((t) => t.kind === "interest")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employees Saving Management</h1>
        <p className="text-muted-foreground">Your savings, interest and withdrawals.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/savings/statement"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <FileText className="h-4 w-4" /> Print account statement
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">My savings balance</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{money(mine?.balance ?? 0)}</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">Interest earned to date</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-green-600">{money(interestToDate)}</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">Interest rate</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{config.annualRatePct}%</p>
          <p className="text-xs text-muted-foreground">per year, compounded monthly</p>
        </div>
      </div>

      <ImportApprovalsInbox approvals={pendingApprovals} />

      <WithdrawalRequestPanel balance={mine?.balance ?? 0} requests={myWithdrawals} />

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
                <td className={cn("px-4 py-3 text-right tabular-nums", isCredit(t.kind) ? "text-green-600" : "text-destructive")}>
                  {isCredit(t.kind) ? "+" : "−"}{money(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
