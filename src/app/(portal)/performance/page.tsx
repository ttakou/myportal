import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getNineBox } from "@/lib/performance";
import { getTenantUsers } from "@/lib/admin";
import { PerformanceBoard } from "./_components/performance-board";

export default async function PerformancePage() {
  const isAdmin = isAdminRole(await getCurrentRole());
  const [users, nineBox] = await Promise.all([
    isAdmin ? getTenantUsers() : Promise.resolve([]),
    isAdmin ? getNineBox() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance Management</h1>
        <p className="text-muted-foreground">
          Annual performance appraisals{isAdmin ? " and the 9-box talent grid" : ""}.
        </p>
      </div>

      <Link
        href="/performance/appraisals"
        className="group flex items-center justify-between gap-4 rounded-lg border bg-card p-5 shadow-sm transition hover:bg-accent"
      >
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Annual appraisals</p>
            <p className="text-sm text-muted-foreground">
              Set objectives, track progress, complete your self-assessment, manager review,
              calibration and the final outcome.
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
      </Link>

      {isAdmin && (
        <PerformanceBoard
          users={users.map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))}
          nineBox={nineBox}
        />
      )}
    </div>
  );
}
