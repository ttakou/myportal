import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getAccessReview,
  getAccessRoles,
  getDepartments,
  getReportPeople,
  type AccessReviewRow,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

const FN_LABEL: Record<string, string> = {
  canteen_staff: "Canteen staff",
  canteen_manager: "Canteen mgr",
  hr_admin: "HR",
  finance: "Finance",
  safety_admin: "Safety",
  oim: "OIM",
  system_admin: "Sys admin",
};

const fnLabel = (r: string) => FN_LABEL[r] ?? r;
const accountLabel = (r: string) => r.replace(/_/g, " ");

export default async function AccessReviewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; user?: string; accessRole?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">This report is available to system administrators.</p>
        <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const department = sp.department || null;
  const userId = sp.user || null;
  const accessRole = sp.accessRole || null;

  const [departments, people, accessRoles, report] = await Promise.all([
    getDepartments(),
    getReportPeople(),
    getAccessRoles(),
    getAccessReview({ department, userId, accessRole }),
  ]);

  const fmtRow = (r: AccessReviewRow) => [
    r.name ?? "",
    r.department ?? "",
    accountLabel(r.account_role),
    r.functional_roles.map(fnLabel).join("; "),
    r.access_roles.join("; "),
    r.is_active ? "Active" : "Inactive",
    r.privileged ? "Privileged" : "",
  ];
  const csv: string[][] = [
    ["Name", "Department", "Account role", "Functional roles", "Access roles", "Status", "Flag"],
    ...report.rows.map(fmtRow),
  ];

  const meta = [
    department ? `Department: ${department}` : "All departments",
    accessRole ? `Access role: ${accessRole}` : "All access roles",
    userId ? `Person: ${people.find((p) => p.id === userId)?.name ?? "—"}` : "All users",
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <CsvExportButton filename="access-review.csv" table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Access review"
        subtitle="Account role, functional roles and assigned access roles per user. Privileged holders are flagged for audit."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters
          show={{ department: true, accessRole: true, user: true }}
          departments={departments}
          users={people}
          accessRoles={accessRoles}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Users" value={report.summary.users} />
        <Kpi label="Privileged" value={report.summary.privileged} tone="amber" />
        <Kpi label="With access roles" value={report.summary.withAccessRoles} />
        <Kpi label="Inactive" value={report.summary.inactive} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Account role</th>
              <th className="px-3 py-2 font-medium">Functional roles</th>
              <th className="px-3 py-2 font-medium">Access roles</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <ProgressiveTableBody colSpan={6} className="divide-y" label="Show more users">
            {report.rows.map((r) => (
              <tr key={r.id} className={cn(r.privileged && "bg-amber-50")}>
                <td className="px-3 py-1.5 font-medium">
                  {r.name ?? "—"}
                  {r.privileged && (
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800">
                      Privileged
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.department ?? "—"}</td>
                <td className="px-3 py-1.5 capitalize">{accountLabel(r.account_role)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {r.functional_roles.map((fr) => (
                      <span key={fr} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {fnLabel(fr)}
                      </span>
                    ))}
                    {r.functional_roles.length === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {r.access_roles.map((ar) => (
                      <span key={ar} className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        {ar}
                      </span>
                    ))}
                    {r.access_roles.length === 0 && <span className="text-muted-foreground">—</span>}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <span className={cn("text-xs", r.is_active ? "text-green-700" : "text-muted-foreground")}>
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No users match these filters.
                </td>
              </tr>
            )}
          </ProgressiveTableBody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", tone === "amber" && value > 0 && "border-amber-300 bg-amber-50")}>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
