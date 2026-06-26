import Link from "next/link";
import { ArrowLeft, ShieldX, CalendarCheck } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getEntitledToday } from "@/lib/canteen";
import {
  getActiveEmployees,
  getEntitlements,
  getRedemptionHistory,
} from "@/lib/canteen-entitlements";
import { EntitlementsManager } from "./_components/entitlements-manager";
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
  const rosterPlates = roster.reduce((s, p) => s + p.plates, 0);

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

      {/* Daily canteen-access roster: who may eat on a chosen day. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Daily canteen access</h2>
          </div>
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <label className="text-sm">
              <span className="mr-1 text-muted-foreground">Day</span>
              <input type="date" name="day" defaultValue={day} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
            <button type="submit" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              View
            </button>
          </form>
        </div>
        <p className="text-sm text-muted-foreground">
          {roster.length} employee(s) may access the canteen on {day} — {rosterPlates} plate(s) including
          booked guests. Eligibility comes from active staff marked lunch-eligible plus the entitlement
          grants above; adjust a grant to change who is in this list.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium text-right">Plates</th>
                <th className="px-4 py-3 font-medium">Today&apos;s booking</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.map((p) => (
                <tr key={p.profileId}>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.email ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.plates}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.dishLabel ?? <span className="text-muted-foreground/60">No booking</span>}
                    {p.collected && <span className="ml-1 text-green-600">· collected</span>}
                  </td>
                </tr>
              ))}
              {roster.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No one is eligible to access the canteen on this day.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RedemptionHistory rows={redemptions} from={from} to={to} />
    </div>
  );
}
