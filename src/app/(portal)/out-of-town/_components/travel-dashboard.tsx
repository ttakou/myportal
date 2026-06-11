import { MapPinned, PlaneTakeoff, PlaneLanding, TriangleAlert, Users } from "lucide-react";
import { TRAVEL_TYPE_LABEL, type TravelDashboard, type Trip } from "@/types/trips";

function TripLine({ trip }: { trip: Trip }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span>
        <span className="font-medium">{trip.requester_name ?? "Unknown"}</span>
        <span className="text-muted-foreground">
          {" "}
          · {trip.destination} · {TRAVEL_TYPE_LABEL[trip.travel_type]}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        {trip.depart_date}
        {trip.return_date ? ` → ${trip.return_date}` : ""}
      </span>
    </li>
  );
}

function Panel({
  title,
  icon: Icon,
  trips,
  tone = "default",
  empty,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  trips: Trip[];
  tone?: "default" | "alert";
  empty: string;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="flex items-center gap-2 font-medium">
          <Icon className={tone === "alert" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-primary"} />
          {title}
        </h3>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs font-medium " +
            (tone === "alert" && trips.length > 0
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground")
          }
        >
          {trips.length}
        </span>
      </header>
      {trips.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {trips.map((t) => (
            <TripLine key={t.id} trip={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function TravelDashboardView({ data }: { data: TravelDashboard }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Travel safety dashboard</h2>

      {data.needsHelp.length > 0 && (
        <Panel
          title="Assistance requested"
          icon={TriangleAlert}
          trips={data.needsHelp}
          tone="alert"
          empty="No active help requests."
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Currently out of town" icon={Users} trips={data.away} empty="Nobody is away." />
        <Panel
          title="Overdue returns"
          icon={MapPinned}
          trips={data.overdue}
          tone="alert"
          empty="No overdue returns."
        />
        <Panel
          title="Departing today"
          icon={PlaneTakeoff}
          trips={data.departingToday}
          empty="No departures expected today."
        />
        <Panel
          title="Returning today"
          icon={PlaneLanding}
          trips={data.returningToday}
          empty="No returns expected today."
        />
      </div>
    </section>
  );
}
