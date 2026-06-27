import Link from "next/link";
import { FileText } from "lucide-react";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import {
  getAccounts,
  getImportBatches,
  getMyAccount,
  getMyApprovalHistory,
  getMyGoal,
  getMyPendingImportApprovals,
  getMyWithdrawalRequests,
  getFundReconciliation,
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
import { FundReconciliationPanel } from "./_components/fund-reconciliation-panel";
import { SavingsApprovalsView } from "./_components/savings-approvals-view";
import { SavingsForecast } from "./_components/savings-forecast";
import { WithdrawalRequestPanel } from "./_components/withdrawal-request-panel";
import { WithdrawalAdminPanel } from "./_components/withdrawal-admin-panel";
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

  if (view === "forecast") {
    const [acct, config, goal] = await Promise.all([getMyAccount(), getSavingsConfig(), getMyGoal()]);
    const contribs = (acct?.transactions ?? []).filter((t) => t.kind === "contribution");
    const ym = (t: (typeof contribs)[number]) => (t.period ?? t.created_at).slice(0, 7);
    const now = new Date();
    const thisYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 7);
    const monthlyThisMonth = contribs.filter((t) => ym(t) === thisYm).reduce((s, t) => s + t.amount, 0);
    const last12 = contribs.filter((t) => ym(t) >= cutoff).reduce((s, t) => s + t.amount, 0);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Savings Forecast</h1>
          <p className="text-muted-foreground">
            Project your savings, plan a goal, or see when you&apos;ll reach a target.
          </p>
        </div>
        <SavingsForecast
          balance={acct?.balance ?? 0}
          monthlyThisMonth={monthlyThisMonth}
          monthlyAvg12={Math.round(last12 / 12)}
          annualRatePct={config.annualRatePct}
          goal={goal}
        />
      </div>
    );
  }

  if (isApprovalsView) {
    // Finance/admins action withdrawals here (they can't reach the admin view);
    // import-workflow validators see their pending import batches; everyone
    // sees their decision history.
    const canFinance = access.isFinance || isAdmin;
    const [history, pendingImports, pendingWithdrawals] = await Promise.all([
      getMyApprovalHistory(),
      getMyPendingImportApprovals(),
      canFinance ? getWithdrawalRequests() : Promise.resolve([]),
    ]);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Approvals</h1>
          <p className="text-muted-foreground">Approve what&apos;s pending and review your decisions.</p>
        </div>
        {canFinance && <WithdrawalAdminPanel requests={pendingWithdrawals} />}
        <ImportApprovalsInbox approvals={pendingImports} />
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
  const reconciliation = isAdminView ? await getFundReconciliation() : null;

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
        {reconciliation && <FundReconciliationPanel data={reconciliation} />}
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
