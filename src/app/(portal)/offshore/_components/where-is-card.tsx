import { Anchor, BedDouble, CalendarClock, LifeBuoy, MapPin, Ship, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Whereabouts } from "@/lib/offshore/whereabouts";

const STATUS_TONE: Record<string, string> = {
  offshore: "bg-green-50 text-green-800 border-green-200",
  onshore: "bg-muted text-foreground border-border",
  due_offshore: "bg-amber-50 text-amber-800 border-amber-200",
  overdue_off: "bg-amber-50 text-amber-800 border-amber-200",
  off_early: "bg-amber-50 text-amber-800 border-amber-200",
};

/**
 * One person: where the schedule puts them, what the record says, and which
 * bed is theirs — the one in use, or the default when they are ashore.
 */
export function WhereIsCard({ w }: { w: Whereabouts }) {
  const s = w.schedule;
  const headline = s
    ? s.phase === "offshore"
      ? `Offshore on ${w.installation ?? "the installation"}`
      : "Onshore"
    : w.onBoard
      ? `On board ${w.installation ?? ""}`.trim()
      : "Not offshore";

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{w.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[w.jobTitle, w.department].filter(Boolean).join(" · ") || "—"}
            {w.crew ? ` · ${w.crew}` : ""}
            {w.backToBack ? ` · back-to-back ${w.backToBack}` : ""}
          </p>
        </div>
        <p
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold",
            STATUS_TONE[s?.status.kind ?? (w.onBoard ? "offshore" : "onshore")],
          )}
        >
          <MapPin className="h-4 w-4" /> {headline}
        </p>
      </div>

      {s ? (
        <div className={cn("rounded-md border px-3 py-2 text-sm", STATUS_TONE[s.status.kind])}>
          <p className="font-medium">{s.status.line}</p>
          {s.status.note && <p className="mt-0.5 text-xs">{s.status.note}</p>}
        </div>
      ) : (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {w.onRoster
            ? w.isRotational
              ? "On the roster but on no crew, so there is no rotation schedule to read. Assign a crew on the Offshore staff screen."
              : "Not on a rotation: the record of trips is the only source."
            : "Not on the offshore roster."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<CalendarClock className="h-4 w-4" />}
          label={s ? (s.phase === "offshore" ? "Current crew change" : "Next crew change") : "Crew change"}
          value={s ? `${s.hitchFrom} → ${s.hitchTo}` : "—"}
          sub={s ? `${s.phase === "offshore" ? "Due off" : "Due out"} ${s.nextChange} · in ${s.daysToChange} day${s.daysToChange === 1 ? "" : "s"}` : undefined}
        />
        <Stat
          icon={<BedDouble className="h-4 w-4" />}
          label={w.bed.source === "trip" ? "Bed in use" : w.bed.source === "default" ? "Default bed" : "Bed"}
          value={w.bed.label ?? "Not assigned"}
          sub={
            w.bed.differsFromDefault
              ? `Default is ${w.bed.differsFromDefault}`
              : w.bed.source === "default" && w.onBoard
                ? "No bed on this trip; showing the roster default"
                : undefined
          }
        />
        <Stat
          icon={<LifeBuoy className="h-4 w-4" />}
          label="Muster station"
          value={w.lifeboat ?? "Not assigned"}
        />
        <Stat
          icon={<Anchor className="h-4 w-4" />}
          label="Installation"
          value={w.installation ?? "—"}
        />
      </div>

      <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        <Stat
          icon={<Ship className="h-4 w-4" />}
          label="Last recorded trip"
          value={
            w.lastTrip
              ? `${w.lastTrip.mobilize}${w.lastTrip.demob ? ` → ${w.lastTrip.demob}` : ""}`
              : "None"
          }
          sub={w.lastTrip ? `${w.lastTrip.status.replace(/_/g, " ")}${w.lastTrip.installation ? ` · ${w.lastTrip.installation}` : ""}` : undefined}
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Last check-in at the base"
          value={w.lastCheckIn ? w.lastCheckIn.date : "Never"}
          sub={
            w.lastCheckIn
              ? `In ${w.lastCheckIn.at.slice(11, 16)}${w.lastCheckIn.out ? ` · out ${w.lastCheckIn.out.slice(11, 16)}` : ""} UTC`
              : "Security records arrivals at the gate; nothing recorded means they have not passed it."
          }
        />
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
