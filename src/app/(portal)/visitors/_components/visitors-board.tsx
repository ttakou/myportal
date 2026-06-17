"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/components/permissions-provider";
import {
  VISITOR_STATUS_LABEL,
  type Visitor,
  type VisitorStatus,
} from "@/types/visitors";
import {
  cancelVisitor,
  checkInVisitor,
  checkOutVisitor,
  preRegisterVisitor,
} from "../actions";

const STATUS_STYLE: Record<VisitorStatus, string> = {
  pre_registered: "bg-muted text-muted-foreground",
  checked_in: "bg-primary/10 text-primary",
  checked_out: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

export function VisitorsBoard({
  visitDate,
  visitors,
  isAdmin,
}: {
  visitDate: string;
  visitors: Visitor[];
  isAdmin: boolean;
}) {
  const { can } = usePermissions();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [purpose, setPurpose] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => preRegisterVisitor({ fullName, company, purpose, visitDate }),
      () => {
        setFullName("");
        setCompany("");
        setPurpose("");
      },
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {can("visitors", "create") && (
      <form
        onSubmit={register}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Visitor name"
          required
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Purpose of visit"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={pending}>
          <UserPlus className="h-4 w-4" /> Pre-register
        </Button>
      </form>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Visitor</th>
              <th className="px-4 py-3 font-medium">Host</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visitors.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{v.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[v.company, v.purpose].filter(Boolean).join(" · ") || "—"}
                    {v.badge_no && ` · Badge ${v.badge_no}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{v.host_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
                      STATUS_STYLE[v.status],
                    )}
                  >
                    {VISITOR_STATUS_LABEL[v.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {v.status === "pre_registered" && (
                      <>
                        {isAdmin && (
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              const badge =
                                window.prompt("Badge number (optional)") ?? undefined;
                              run(() => checkInVisitor(v.id, badge));
                            }}
                          >
                            Check in
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => cancelVisitor(v.id))}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {v.status === "checked_in" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => checkOutVisitor(v.id))}
                      >
                        Check out
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visitors.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No visitors for this date yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
