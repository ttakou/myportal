import Link from "next/link";
import { History, LayoutDashboard, ScanLine, Settings } from "lucide-react";
import { getMenu, getMyBookings, getServedMealPeriods, resolveServiceDate } from "@/lib/canteen";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { MenuBoard } from "./_components/menu-board";

export default async function CanteenPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const serviceDate = resolveServiceDate(searchParams.date);
  const [dishes, bookings, role, mealPeriods] = await Promise.all([
    getMenu(serviceDate),
    getMyBookings(serviceDate),
    getCurrentRole(),
    getServedMealPeriods(),
  ]);
  const isAdmin = isAdminRole(role);

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
          {isAdmin && (
            <>
              <Link
                href="/canteen/serving"
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <ScanLine className="h-4 w-4" />
                Serving point
              </Link>
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
        />
      )}
    </div>
  );
}
