import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getActiveEmployees,
  getEntitlements,
  getRedemptionHistory,
} from "@/lib/canteen-entitlements";
import { EntitlementsManager } from "./_components/entitlements-manager";
import { RedemptionHistory } from "./_components/redemption-history";

export default async function EntitlementsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  if (!(await getAccess()).isHr) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">HR only</h1>
        <p className="text-sm text-muted-foreground">
          Meal entitlements are managed by HR.
        </p>
        <Link href="/canteen" className="text-sm font-medium text-primary hover:underline">
          ← Back to the canteen
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const from = searchParams.from || defaultFrom;
  const to = searchParams.to || today;

  const [entitlements, employees, redemptions] = await Promise.all([
    getEntitlements(),
    getActiveEmployees(),
    getRedemptionHistory(from, to),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/canteen"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Canteen
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Meal entitlements</h1>
        <p className="text-muted-foreground">
          Grant canteen meals for a defined period — e.g. a year for onshore
          staff, a month for an offshore crew on a project, or a few days for an
          offshore worker visiting the onshore office. Expired grants are kept
          for history.
        </p>
      </div>

      <EntitlementsManager entitlements={entitlements} employees={employees} />

      <RedemptionHistory rows={redemptions} from={from} to={to} />
    </div>
  );
}
