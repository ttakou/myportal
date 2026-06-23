import Link from "next/link";
import { ArrowLeft, ShieldX, TrendingUp } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getDishDemand,
  getOptionDemand,
  getReservations,
  getServedMealPeriods,
  resolveServiceDate,
} from "@/lib/canteen";
import { RealtimeDashboard } from "./realtime-dashboard";

export default async function CampbossPage(
  props: {
    searchParams: Promise<{ date?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  if (!(await getAccess()).isCanteenManager) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Campboss only</h1>
        <p className="text-muted-foreground">
          The campboss dashboard is available to canteen administrators.
        </p>
        <Link href="/canteen" className="text-sm font-medium text-primary hover:underline">
          ← Back to the canteen
        </Link>
      </div>
    );
  }

  const serviceDate = resolveServiceDate(searchParams.date);
  const [initial, initialOptions, initialReservations, mealPeriods] = await Promise.all([
    getDishDemand(serviceDate),
    getOptionDemand(serviceDate),
    getReservations(serviceDate),
    getServedMealPeriods(),
  ]);
  const prettyDate = new Date(serviceDate + "T00:00:00").toLocaleDateString(
    undefined,
    { weekday: "long", month: "long", day: "numeric" },
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/canteen"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Canteen
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Campboss dashboard</h1>
            <p className="text-muted-foreground">Live meal demand · {prettyDate}</p>
          </div>
          <Link
            href="/canteen/forecast"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <TrendingUp className="h-4 w-4" /> Plate forecast
          </Link>
        </div>
      </div>

      <RealtimeDashboard
        serviceDate={serviceDate}
        initial={initial}
        initialOptions={initialOptions}
        initialReservations={initialReservations}
        mealPeriods={mealPeriods}
      />
    </div>
  );
}
