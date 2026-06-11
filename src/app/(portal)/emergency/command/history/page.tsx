import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getIncidentHistory } from "@/lib/emergency";
import { IncidentHistory } from "./_components/incident-history";

export default async function IncidentHistoryPage() {
  // Safety coordinators only — everyone else is bounced to the employee view.
  if (!(await getAccess()).isSafetyAdmin) {
    redirect("/emergency");
  }

  const incidents = await getIncidentHistory();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/emergency/command"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Command center
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Incident history</h1>
        <p className="text-muted-foreground">
          Every SOS and reported incident, with its resolution trail.
        </p>
      </div>

      <IncidentHistory incidents={incidents} />
    </div>
  );
}
