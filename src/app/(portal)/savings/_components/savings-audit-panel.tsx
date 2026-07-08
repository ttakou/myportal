import { ScrollText } from "lucide-react";
import type { SavingsAuditEntry } from "@/lib/savings";

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  "account.open": { label: "Account opened", cls: "bg-blue-100 text-blue-700" },
  "transaction.contribution": { label: "Contribution", cls: "bg-green-100 text-green-700" },
  "transaction.withdrawal": { label: "Withdrawal", cls: "bg-red-100 text-red-700" },
  "interest.run": { label: "Interest run", cls: "bg-purple-100 text-purple-700" },
  "config.rate": { label: "Rate change", cls: "bg-amber-100 text-amber-800" },
  "config.workflow": { label: "Workflow config", cls: "bg-amber-100 text-amber-800" },
  "import.submit": { label: "Import submitted", cls: "bg-blue-100 text-blue-700" },
  "import.approve": { label: "Import approved", cls: "bg-green-100 text-green-700" },
  "import.reject": { label: "Import rejected", cls: "bg-red-100 text-red-700" },
  "import.commit": { label: "Import committed", cls: "bg-green-100 text-green-700" },
  "import.cancel": { label: "Import cancelled", cls: "bg-muted text-muted-foreground" },
  "withdrawal.request": { label: "Withdrawal requested", cls: "bg-blue-100 text-blue-700" },
  "withdrawal.approve": { label: "Withdrawal approved", cls: "bg-green-100 text-green-700" },
  "withdrawal.reject": { label: "Withdrawal declined", cls: "bg-red-100 text-red-700" },
  "withdrawal.release": { label: "Withdrawal released", cls: "bg-green-100 text-green-700" },
};

/** Read-only audit trail of every savings-module action. */
export function SavingsAuditPanel({ entries }: { entries: SavingsAuditEntry[] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Audit trail</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Every action in the savings module — accounts, transactions, imports, interest, withdrawals
        and configuration changes.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Detail</th>
              <th className="px-4 py-3 font-medium">By</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((e) => {
              const a = ACTION_LABEL[e.action] ?? { label: e.action, cls: "bg-muted text-muted-foreground" };
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.cls}`}>{a.label}</span>
                  </td>
                  <td className="px-4 py-2">{e.summary}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.actorName ?? "—"}</td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No activity recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
