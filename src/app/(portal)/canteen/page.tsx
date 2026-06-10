import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { getMenu, getMyBookings, resolveServiceDate } from "@/lib/canteen";
import { MenuBoard } from "./_components/menu-board";

export default async function CanteenPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const serviceDate = resolveServiceDate(searchParams.date);
  const [dishes, bookings] = await Promise.all([
    getMenu(serviceDate),
    getMyBookings(serviceDate),
  ]);

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
        <Link
          href="/canteen/campboss"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <LayoutDashboard className="h-4 w-4" />
          Campboss dashboard
        </Link>
      </div>

      {dishes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No menu has been published for this date yet.
        </p>
      ) : (
        <MenuBoard serviceDate={serviceDate} dishes={dishes} bookings={bookings} />
      )}
    </div>
  );
}
