import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getEntitledToday } from "@/lib/canteen";
import {
  getActiveEmployees,
  getEntitlements,
  getRedemptionHistory,
} from "@/lib/canteen-entitlements";
import { EntitlementsManager } from "./_components/entitlements-manager";
import { DailyAccessPanel } from "./_components/daily-access-panel";
import { RedemptionHistory } from "./_components/redemption-history";

export default async function EntitlementsPage(
  props: {
    searchParams: Promise<{ from?: string; to?: string; day?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const access = await getAccess();
  if (!(access.isHrCanteen || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">HR Canteen only</h1>
        <p className="text-sm text-muted-foreground">
          Meal entitlements are managed by HR Canteen (and super admins).
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
  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day ?? "") ? searchParams.day! : today;

  const [entitlements, employees, redemptions, roster] = await Promise.all([
    getEntitlements(),
    getActiveEmployees(),
    getRedemptionHistory(from, to),
    getEntitledToday(day),
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

      <DailyAccessPanel
        day={day}
        roster={roster.map((p) => ({
          profileId: p.profileId,
          name: p.name,
          email: p.email,
          plates: p.plates,
          dishLabel: p.dishLabel,
          collected: p.collected,
        }))}
        employees={employees.map((e) => ({ id: e.id, name: e.full_name || e.email || "Unknown" }))}
      />

      <RedemptionHistory rows={redemptions} from={from} to={to} />
    </div>
  );
}
