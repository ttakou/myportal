import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getDishDemand, resolveServiceDate } from "@/lib/canteen";
import { RealtimeDashboard } from "./realtime-dashboard";

export default async function CampbossPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const role = await getCurrentRole();

  if (!isAdminRole(role)) {
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
  const initial = await getDishDemand(serviceDate);
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
        <h1 className="text-2xl font-semibold tracking-tight">Campboss dashboard</h1>
        <p className="text-muted-foreground">Live meal demand · {prettyDate}</p>
      </div>

      <RealtimeDashboard serviceDate={serviceDate} initial={initial} />
    </div>
  );
}
