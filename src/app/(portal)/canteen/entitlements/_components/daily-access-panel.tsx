"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { CalendarCheck, Plus, X, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { setDailyAccess } from "../actions";

export interface DailyRosterRow {
  profileId: string;
  name: string;
  email: string | null;
  plates: number;
  dishLabel: string | null;
  collected: boolean;
}

/**
 * The standing daily canteen-access list: who may use the canteen day-to-day.
 * HR Canteen adds people (grants lunch eligibility) and removes them (revokes
 * it). The chosen day just shows each person's booking for that date.
 */
export function DailyAccessPanel({
  day,
  roster,
  employees,
}: {
  day: string;
  roster: DailyRosterRow[];
  employees: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const onRoster = new Set(roster.map((r) => r.profileId));
  const addable = employees.filter((e) => !onRoster.has(e.id));
  const plates = roster.reduce((s, r) => s + r.plates, 0);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Daily canteen access</h2>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mr-1 text-muted-foreground">Day</span>
            <input type="date" name="day" defaultValue={day} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            View
          </button>
        </form>
      </div>

      <p className="text-sm text-muted-foreground">
        {roster.length} employee(s) may use the canteen — {plates} plate(s) including booked guests on{" "}
        {day}. Add or remove people to control day-to-day access. For special period access (e.g. a
        visiting crew for a few days) use the grants above.
      </p>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {/* Add people to the access list */}
      <div className="rounded-lg border bg-card p-3">
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add people
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Add people to canteen access</p>
              <button type="button" onClick={() => { setAdding(false); setPicked([]); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {addable.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone active already has canteen access.</p>
            ) : (
              <div className="max-h-44 overflow-auto rounded-md border p-2">
                <div className="flex flex-wrap gap-1.5">
                  {addable.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggle(e.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        picked.includes(e.id) ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={pending || picked.length === 0}
                onClick={() => run(() => setDailyAccess(picked, true), () => { setPicked([]); setAdding(false); })}
              >
                {pending ? "Adding…" : `Add ${picked.length || ""} to access`}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium text-right">Plates</th>
              <th className="px-4 py-3 font-medium">Booking on {day}</th>
              <th className="px-4 py-3 font-medium text-right">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {roster.map((p) => (
              <tr key={p.profileId}>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{p.email ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.plates}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {p.dishLabel ?? <span className="text-muted-foreground/60">No booking</span>}
                  {p.collected && <span className="ml-1 text-green-600">· collected</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => setDailyAccess([p.profileId], false))}
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Remove
                  </Button>
                </td>
              </tr>
            ))}
            {roster.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No one has canteen access yet — add people above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
