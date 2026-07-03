import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAccess } from "@/lib/auth";
import {
  getAccountability,
  getActiveBroadcasts,
  getAllIncidents,
  getHelpRequests,
  getIncidentUpdates,
  getRecentDeliveries,
} from "@/lib/emergency";
import { getResponseTeamsOnBoard } from "@/lib/offshore/response-teams";
import type { IncidentUpdate } from "@/types/emergency";
import { CommandCenter } from "./_components/command-center";
import { LiveRefresh } from "@/components/live-refresh";

export default async function CommandCenterPage() {
  // Safety coordinators only — everyone else is bounced to the employee view.
  if (!(await getAccess()).isSafetyAdmin) {
    redirect("/emergency");
  }

  const [incidents, broadcasts, deliveries, responseTeams] = await Promise.all([
    getAllIncidents(),
    getActiveBroadcasts(),
    getRecentDeliveries(),
    getResponseTeamsOnBoard(),
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

      {/* Offshore response capability right now: HLO & fire team members on
          board (active rotation window × live POB). Hidden for tenants without
          offshore team assignments. */}
      {responseTeams.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {responseTeams.map(({ team, label, onboard, ashore }) => (
            <div
              key={team}
              className={cn(
                "rounded-lg border p-3",
                team === "fire_team" ? "border-red-200 bg-red-50/50" : "border-sky-200 bg-sky-50/50",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                    team === "fire_team" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800",
                  )}
                >
                  <Siren className="h-3 w-3" />
                  {label} on board (offshore)
                </span>
                <span className="text-xs text-muted-foreground">
                  {onboard.length} on board{ashore > 0 ? ` · ${ashore} ashore` : ""}
                </span>
              </div>
              {onboard.length === 0 ? (
                <p className="text-sm font-medium text-destructive">
                  Nobody from this team is on board.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {onboard.map((name) => (
                    <li
                      key={name}
                      className="rounded-full border bg-background px-2 py-0.5 text-xs font-medium"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

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
