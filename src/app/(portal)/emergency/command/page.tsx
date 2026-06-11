import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getAccountability,
  getActiveBroadcasts,
  getAllIncidents,
  getHelpRequests,
  getRecentDeliveries,
} from "@/lib/emergency";
import { CommandCenter } from "./_components/command-center";

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
  const [accountability, helpRequests] = await Promise.all([
    getAccountability(event?.id ?? null),
    getHelpRequests(event?.id ?? null),
  ]);

  return (
    <div className="space-y-6">
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

      <CommandCenter
        incidents={incidents}
        broadcasts={broadcasts}
        accountability={accountability}
        helpRequests={helpRequests}
        deliveries={deliveries}
        eventTitle={event?.title ?? null}
      />
    </div>
  );
}
