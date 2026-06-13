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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance Management</h1>
        <p className="text-muted-foreground">OKRs, continuous feedback and the 9-box grid.</p>
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
