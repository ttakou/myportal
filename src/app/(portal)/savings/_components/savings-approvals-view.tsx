import { ClipboardCheck } from "lucide-react";
import type { ApprovalHistoryItem } from "@/lib/savings";

const DECISION: Record<ApprovalHistoryItem["decision"], string> = {
  approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  released: "bg-blue-100 text-blue-700",
};

/** Read-only history of every approval/decision the signed-in approver made. */
export function SavingsApprovalsView({ items }: { items: ApprovalHistoryItem[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Approval history</h2>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Decision</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {new Date(it.date).toLocaleString()}
                </td>
                <td className="px-4 py-2">{it.type}</td>
                <td className="px-4 py-2">{it.summary}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${DECISION[it.decision]}`}>
                    {it.decision}
                  </span>
                </td>
                <td className="px-4 py-2 capitalize text-muted-foreground">{it.outcome ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  You haven&apos;t made any approvals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
