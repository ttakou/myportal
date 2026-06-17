import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getFeedbackReceived, getMyObjectives, getNineBox } from "@/lib/performance";
import { getTenantUsers } from "@/lib/admin";
import { PerformanceBoard } from "./_components/performance-board";

export default async function PerformancePage() {
  const isAdmin = isAdminRole(await getCurrentRole());
  const [objectives, feedback, users, nineBox] = await Promise.all([
    getMyObjectives(),
    getFeedbackReceived(),
    getTenantUsers(),
    isAdmin ? getNineBox() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance Management</h1>
          <p className="text-muted-foreground">OKRs, continuous feedback and the 9-box grid.</p>
        </div>
        <Link
          href="/performance/appraisals"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          Annual appraisals <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <PerformanceBoard
        objectives={objectives}
        feedback={feedback}
        users={users.map((u) => ({ id: u.id, name: u.full_name || u.email || "Unknown" }))}
        nineBox={nineBox}
        isAdmin={isAdmin}
      />
    </div>
  );
}
