import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getActiveExtras,
  getEntitlementCandidates,
  getEntitlementRoster,
} from "@/lib/canteen-entitlements";
import { EntitlementsManager } from "./_components/entitlements-manager";

export default async function EntitlementsPage() {
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

  const [roster, extras, candidates] = await Promise.all([
    getEntitlementRoster(),
    getActiveExtras(),
    getEntitlementCandidates(),
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
          Define who is entitled to a meal each working day (Mon–Fri), and add
          temporary top-ups for employees hosting visitors. Entitlements renew
          automatically at the start of every month.
        </p>
      </div>

      <EntitlementsManager roster={roster} extras={extras} candidates={candidates} />
    </div>
  );
}
