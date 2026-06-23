import Link from "next/link";
import { ArrowLeft, ShieldX, TrendingUp, UserX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getCanteenForecast } from "@/lib/canteen";
import { KITCHEN_LABEL } from "@/types/canteen";

export default async function CanteenForecastPage() {
  if (!(await getAccess()).isCanteenManager) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Campboss only</h1>
        <p className="text-muted-foreground">
          The forecast is available to canteen administrators.
        </p>
        <Link href="/canteen" className="text-sm font-medium text-primary hover:underline">
          ← Back to the canteen
        </Link>
      </div>
    );
  }

  const forecast = await getCanteenForecast({ days: 7, noShowWindowDays: 30 });
  const kitchenNames = [
    ...new Set(forecast.days.flatMap((d) => d.byKitchen.map((k) => k.kitchenName))),
  ].sort((a, b) => a.localeCompare(b));

  const dayLabel = (date: string, isToday: boolean) =>
    isToday
      ? "Today"
      : new Date(date + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/canteen/campboss"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Campboss dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Plate forecast</h1>
        <p className="text-muted-foreground">
          Expected plates (staff + visitors) per kitchen for the next 7 days, from current bookings.
        </p>
      </div>

      {/* Forward plate forecast */}
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-1.5 font-medium">
          <TrendingUp className="h-4 w-4" /> Expected plates
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Kitchen</th>
                {forecast.days.map((d) => (
                  <th key={d.date} className="px-2 py-2 text-right font-medium">
                    {dayLabel(d.date, d.isToday)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kitchenNames.map((name) => (
                <tr key={name} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{name}</td>
                  {forecast.days.map((d) => {
                    const k = d.byKitchen.find((x) => x.kitchenName === name);
                    return (
                      <td key={d.date} className="px-2 py-2 text-right tabular-nums">
                        {k ? (
                          <span title={`${k.headcount} staff + ${k.guests} visitors`}>{k.plates}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-4">All kitchens</td>
                {forecast.days.map((d) => (
                  <td key={d.date} className="px-2 py-2 text-right tabular-nums">
                    {d.plates || <span className="font-normal text-muted-foreground">0</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {kitchenNames.length === 0 && (
          <p className="text-sm text-muted-foreground">No bookings yet for the next 7 days.</p>
        )}
        <p className="text-xs text-muted-foreground">Hover a number to see the staff/visitor split.</p>
      </section>

      {/* No-show tracking */}
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <div>
          <h2 className="flex items-center gap-1.5 font-medium">
            <UserX className="h-4 w-4" /> No-shows
          </h2>
          <p className="text-sm text-muted-foreground">
            Booked but not collected over the last {forecast.noShowWindowDays} days.
          </p>
        </div>
        {forecast.noShows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collected or missed meals in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Kitchen</th>
                <th className="px-2 py-2 text-right font-medium">Collected</th>
                <th className="px-2 py-2 text-right font-medium">Missed</th>
                <th className="px-2 py-2 text-right font-medium">No-show rate</th>
              </tr>
            </thead>
            <tbody>
              {forecast.noShows.map((s) => (
                <tr key={s.kitchenName} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{s.kitchenName}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.collected}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.missed}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span
                      className={
                        s.rate >= 25
                          ? "font-semibold text-destructive"
                          : s.rate >= 10
                            ? "text-amber-700"
                            : "text-muted-foreground"
                      }
                    >
                      {s.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {Object.values(KITCHEN_LABEL).join(" · ")}
      </p>
    </div>
  );
}
