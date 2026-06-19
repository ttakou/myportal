import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getAccountability,
  getActiveBroadcasts,
  getAllIncidents,
  getHelpRequests,
  getIncidentUpdates,
  getRecentDeliveries,
} from "@/lib/emergency";
import type { IncidentUpdate } from "@/types/emergency";
import { CommandCenter } from "./_components/command-center";
import { LiveRefresh } from "@/components/live-refresh";

export default async function CommandCenterPage() {
  // Safety coordinators only — everyone else is bounced to the employee view.
  if (!(await getAccess()).isSafetyAdmin) {
    redirect("/emergency");
  }

  const [incidents, broadcasts, deliveries] = await Promise.all([
    getAllIncidents(),
    getActiveBroadcasts(),
    getRecentDeliveries(),
  ]);

  // Accountability is tracked against the active event that requested check-ins.
  const event = broadcasts.find((b) => b.requires_checkin) ?? null;
  const [accountability, helpRequests, updatesMap] = await Promise.all([
    getAccountability(event?.id ?? null),
    getHelpRequests(event?.id ?? null),
    getIncidentUpdates(incidents.map((i) => i.id)),
  ]);
  const updatesByIncident: Record<string, IncidentUpdate[]> = {};
  for (const [id, list] of updatesMap) updatesByIncident[id] = list;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/emergency"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Emergency Support
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Crisis command center</h1>
          <p className="text-muted-foreground">
            Live incidents, accountability and mass alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveRefresh />
          <Link
            href="/emergency/command/history"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <History className="h-4 w-4" />
            Incident history
          </Link>
        </div>
      </div>

      <CommandCenter
        incidents={incidents}
        broadcasts={broadcasts}
        accountability={accountability}
        helpRequests={helpRequests}
        deliveries={deliveries}
        eventTitle={event?.title ?? null}
        updatesByIncident={updatesByIncident}
      />
    </div>
  );
}
