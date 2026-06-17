import Link from "next/link";
import { BarChart3, History, LayoutDashboard, MessageSquare, ScanLine, Settings, UtensilsCrossed, Users } from "lucide-react";
import { getCanteenCutoff, getMenu, getMyBookings, getServedMealPeriods, resolveServiceDate, today } from "@/lib/canteen";
import { getAccess } from "@/lib/auth";
import { MenuBoard } from "./_components/menu-board";

export default async function CanteenPage(
  props: {
    searchParams: Promise<{ date?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const serviceDate = resolveServiceDate(searchParams.date);
  const [dishes, bookings, access, mealPeriods, cutoff] = await Promise.all([
    getMenu(serviceDate),
    getMyBookings(serviceDate),
    getAccess(),
    getServedMealPeriods(),
    getCanteenCutoff(),
  ]);
  const bookingClosed =
    cutoff != null && serviceDate === today() && new Date().getHours() >= cutoff;
  const canManage = access.isCanteenManager;
  const canServe = access.isCanteenStaff;
  const canEntitle = access.isHr;
  const canReport = access.isFinance || access.isCanteenManager;

  const prettyDate = new Date(serviceDate + "T00:00:00").toLocaleDateString(
    undefined,
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Canteen</h1>
          <p className="text-muted-foreground">{prettyDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/canteen/history"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <History className="h-4 w-4" />
            History
          </Link>
          <Link
            href="/canteen/feedback"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <MessageSquare className="h-4 w-4" />
            Feedback
          </Link>
          {canServe && (
            <Link
              href="/canteen/serving"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <ScanLine className="h-4 w-4" />
              Serving point
            </Link>
          )}
          {canServe && (
            <Link
              href="/canteen/redeem"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <UtensilsCrossed className="h-4 w-4" />
              Meal serving
            </Link>
          )}
          {canEntitle && (
            <Link
              href="/canteen/entitlements"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <Users className="h-4 w-4" />
              Entitlements
            </Link>
          )}
          {canManage && (
            <>
              <Link
                href="/canteen/manage"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Settings className="h-4 w-4" />
                Manage menu
              </Link>
              <Link
                href="/canteen/campboss"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <LayoutDashboard className="h-4 w-4" />
                Campboss dashboard
              </Link>
            </>
          )}
          {canReport && (
            <Link
              href="/canteen/reports"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <BarChart3 className="h-4 w-4" />
              Reports
            </Link>
          )}
        </div>
      </div>

      {dishes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No menu has been published for this date yet.
        </p>
      ) : (
        <MenuBoard
          serviceDate={serviceDate}
          dishes={dishes}
          bookings={bookings}
          mealPeriods={mealPeriods}
          bookingClosed={bookingClosed}
          cutoffHour={cutoff}
        />
      )}
    </div>
  );
}
