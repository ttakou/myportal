import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getOnSite } from "@/lib/visitors";
import { getStaffOnSite } from "@/lib/staff-attendance";
import { today } from "@/lib/canteen";
import { MusterList } from "./muster-list";

export default async function MusterPage() {
  if (!isAdminRole(await getCurrentRole())) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <Link href="/visitors" className="text-sm font-medium text-primary hover:underline">
          ← Back to visitors
        </Link>
      </div>
    );
  }

  const date = today();
  const [onSite, staffOnSite] = await Promise.all([getOnSite(date), getStaffOnSite(date)]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/visitors"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Visitors
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Emergency muster list</h1>
        <p className="text-muted-foreground">
          Everyone on site today ({date}) — staff and visitors, updates live. Earlier
          days are available in the visitor records.
        </p>
      </div>

      <MusterList initial={onSite} staff={staffOnSite} date={date} />
    </div>
  );
}
