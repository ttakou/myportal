"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { UserCheck, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DelegationRow, DelegationStatus } from "@/lib/delegation";
import { createDelegation, revokeDelegation } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const STATUS_STYLE: Record<DelegationStatus, string> = {
  active: "bg-green-100 text-green-700",
  upcoming: "bg-primary/10 text-primary",
  expired: "bg-secondary text-secondary-foreground",
  revoked: "bg-muted text-muted-foreground line-through",
};

export function DelegationPanel({
  users,
  outgoing,
  incoming,
}: {
  users: { id: string; name: string }[];
  outgoing: DelegationRow[];
  incoming: DelegationRow[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [delegateId, setDelegateId] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [note, setNote] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => createDelegation({ delegateId, startsOn, endsOn, note }),
      () => {
        setDelegateId("");
        setNote("");
      },
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Delegate my access</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Let a colleague act with your access for a set period — e.g. while you&apos;re on leave. They
        keep their own login and gain your module rights and roles for the dates below. Administrator
        rights are never delegated.
      </p>

      {/* Access this user currently holds on someone else's behalf. */}
      {incoming.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-green-800">
            <UserCheck className="h-4 w-4" /> You currently hold delegated access
          </p>
          <ul className="mt-1 space-y-0.5 text-green-800">
            {incoming.map((d) => (
              <li key={d.id}>
                From <span className="font-medium">{d.delegator_name}</span> · {d.starts_on} → {d.ends_on}
                {d.status === "upcoming" && <span className="ml-1 text-xs">(starts {d.starts_on})</span>}
                {d.note && <span className="text-green-700"> — {d.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Delegate to
          <select
            value={delegateId}
            onChange={(e) => setDelegateId(e.target.value)}
            required
            className={`mt-1 block w-full ${field}`}
          >
            <option value="">Choose a colleague…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Reason (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Annual leave"
            className={`mt-1 block w-full ${field}`}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          From
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required className={`mt-1 block w-full ${field}`} />
        </label>
        <label className="text-xs text-muted-foreground">
          Until
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} required className={`mt-1 block w-full ${field}`} />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending || !delegateId}>Delegate access</Button>
        </div>
      </form>

      {outgoing.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Delegate</th>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {outgoing.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-medium">{d.delegate_name}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{d.starts_on} → {d.ends_on}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.note ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLE[d.status])}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(d.status === "active" || d.status === "upcoming") && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Revoke ${d.delegate_name}'s delegated access now?`))
                            run(() => revokeDelegation(d.id));
                        }}
                        className="rounded border px-2 py-0.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
