import Link from "next/link";
import { Siren } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getVisitors } from "@/lib/visitors";
import { today } from "@/lib/canteen";
import { VisitorsBoard } from "./_components/visitors-board";

export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const visitDate =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : today();

  const [visitors, role] = await Promise.all([
    getVisitors(visitDate),
    getCurrentRole(),
  ]);
  const isAdmin = isAdminRole(role);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitors</h1>
          <p className="text-muted-foreground">Pre-registration & reception · {visitDate}</p>
        </div>
        {isAdmin && (
          <Link
            href="/visitors/muster"
            className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <Siren className="h-4 w-4" />
            Muster list
          </Link>
        )}
      </div>

      <VisitorsBoard visitDate={visitDate} visitors={visitors} isAdmin={isAdmin} />
    </div>
  );
}
