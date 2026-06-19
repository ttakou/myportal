import Link from "next/link";
import { FileBarChart, Megaphone, MonitorDot } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getActiveBroadcasts,
  getIncidentUpdates,
  getMyCheckin,
  getMyIncidents,
} from "@/lib/emergency";
import {
  SEVERITY_LABEL,
  type IncidentUpdate,
  type Severity,
} from "@/types/emergency";
import { cn } from "@/lib/utils";
import { SosPanel } from "./_components/sos-panel";
import { SafetyStatusBanner } from "./_components/safety-status-banner";
import { PushToggle } from "./_components/push-toggle";
import { IncidentTracker } from "./_components/incident-tracker";

const SEVERITY_STYLE: Record<Severity, string> = {
  info: "border-sky-300 bg-sky-50 text-sky-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  critical: "border-red-300 bg-red-50 text-red-900",
};

export default async function EmergencyPage() {
  const [access, broadcasts, myIncidents] = await Promise.all([
    getAccess(),
    getActiveBroadcasts(),
    getMyIncidents(),
  ]);

  const checkinBroadcast = broadcasts.find((b) => b.requires_checkin) ?? null;
  const myCheckin = checkinBroadcast ? await getMyCheckin(checkinBroadcast.id) : null;
  const infoBroadcasts = broadcasts.filter((b) => b.id !== checkinBroadcast?.id);

  // Evolution timeline for the user's incidents, keyed by incident id (plain
  // object so it crosses into the client tracker).
  const updatesMap = await getIncidentUpdates(myIncidents.map((i) => i.id));
  const updatesByIncident: Record<string, IncidentUpdate[]> = {};
  for (const [id, list] of updatesMap) updatesByIncident[id] = list;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Emergency Support</h1>
          <p className="text-muted-foreground">
            Raise an alert, see active warnings, and confirm you are safe.
          </p>
          {(access.isSafetyAdmin || access.isOim || access.isAdmin) && (
            <Link
              href="/reports/emergency"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <FileBarChart className="h-4 w-4" /> Incidents report
            </Link>
          )}
        </div>
        {access.isSafetyAdmin && (
          <Link
            href="/emergency/command"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <MonitorDot className="h-4 w-4" />
            Command center
          </Link>
        )}
      </div>

      <PushToggle />

      {checkinBroadcast && (
        <SafetyStatusBanner
          broadcast={checkinBroadcast}
          initialStatus={myCheckin?.status ?? null}
        />
      )}

      {infoBroadcasts.length > 0 && (
        <div className="space-y-2">
          {infoBroadcasts.map((b) => (
            <div key={b.id} className={cn("rounded-lg border p-3", SEVERITY_STYLE[b.severity])}>
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                <span className="font-medium">{b.title}</span>
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium">
                  {SEVERITY_LABEL[b.severity]}
                </span>
              </div>
              <p className="mt-1 text-sm">{b.message}</p>
              {b.location_label && (
                <p className="mt-1 text-xs opacity-80">Area: {b.location_label}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <SosPanel />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">My recent reports</h2>
        <p className="text-sm text-muted-foreground">
          Track each alert&apos;s progress. While an alert is still open you can add updates or
          share a refreshed location.
        </p>
        <IncidentTracker incidents={myIncidents} updatesByIncident={updatesByIncident} />
      </section>
    </div>
  );
}
