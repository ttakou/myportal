import Link from "next/link";
import { History } from "lucide-react";
import { bookingClosedNow, getCanteenCutoff, getMenu, getMyAllowance, getMyBookings, getMyDiet, getMyLunchHistory, getServedMealPeriods, resolveServiceDate } from "@/lib/canteen";
import { DietPanel } from "./_components/diet-panel";
import { LUNCH_OUTCOME_LABEL, type LunchOutcome } from "@/types/canteen";
import { cn } from "@/lib/utils";
import { MenuBoard } from "./_components/menu-board";

const OUTCOME_STYLE: Record<LunchOutcome, string> = {
  booked: "bg-accent text-accent-foreground",
  collected: "bg-green-100 text-green-700",
  missed: "bg-amber-100 text-amber-700",
  cancelled: "bg-destructive/10 text-destructive",
};

export default async function CanteenPage(
  props: {
    searchParams: Promise<{ date?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const serviceDate = resolveServiceDate(searchParams.date);
  const [dishes, bookings, mealPeriods, cutoff, allowance, history, diet] = await Promise.all([
    getMenu(serviceDate),
    getMyBookings(serviceDate),
    getServedMealPeriods(),
    getCanteenCutoff(),
    getMyAllowance(serviceDate),
    getMyLunchHistory(),
    getMyDiet(),
  ]);
  // On the site's clock, not the server's.
  const bookingClosed = bookingClosedNow(serviceDate, cutoff);
  const recent = history.slice(0, 3);

  const prettyDate = new Date(serviceDate + "T00:00:00").toLocaleDateString(
    undefined,
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Canteen</h1>
        <p className="text-muted-foreground">{prettyDate}</p>
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
          allowance={allowance}
          myAllergens={diet.allergens}
        />
      )}

      <DietPanel diet={diet} />

      {recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" /> Recent meals
            </h2>
            <Link href="/canteen/history" className="text-xs font-medium text-primary hover:underline">
              More →
            </Link>
          </div>
          <div className="divide-y rounded-lg border">
            {recent.map((r) => (
              <div key={r.booking_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.dish_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.service_date + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    {r.kitchen_name ? ` · ${r.kitchen_name}` : ""}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", OUTCOME_STYLE[r.outcome])}>
                  {LUNCH_OUTCOME_LABEL[r.outcome]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
