"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Bus, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { localTime } from "@/lib/transport/day-plan";
import { canBook, runKey, runsByDate, seatsLeft, upcomingRuns } from "@/lib/transport/seats";
import type { Shuttle, ShuttleSeat } from "@/types/transport";
import { bookSeat, cancelSeat } from "../actions";

/**
 * The next two weeks of shuttle runs, a seat count on each, and one
 * button: take a seat or give it back. The desk sees who is on every run
 * and can free a seat; everyone else sees names too, the way a sign-up
 * sheet on the wall does.
 */
export function SeatsPanel({
  shuttles,
  seats,
  nowIso,
  meId,
  isAdmin,
}: {
  shuttles: Shuttle[];
  seats: Record<string, ShuttleSeat[]>;
  nowIso: string;
  meId: string | null;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const runs = upcomingRuns(shuttles.filter((s) => s.is_active), nowIso);
  const groups = runsByDate(runs);
  const mine = runs.filter((r) => (seats[runKey(r.shuttle.id, r.date)] ?? []).some((s) => s.profile_id === meId));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bus className="h-5 w-5 text-primary" /> Book a shuttle seat
        </h2>
        <p className="text-sm text-muted-foreground">
          The regular runs over the next two weeks. Take a seat and you are on the driver&apos;s list; you get a reminder
          before it leaves. Give the seat back if your plans change.
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {mine.length > 0 && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <Check className="mr-1 inline h-4 w-4" />
          Your seats: {mine.map((r) => `${fmtDate(r.date)} ${localTime(r.departAt)} ${r.shuttle.name}`).join(" · ")}
        </p>
      )}

      {groups.length === 0 && (
        <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No shuttle runs in the next two weeks.</p>
      )}

      {groups.map((g) => (
        <section key={g.date} className="space-y-2">
          <h3 className="text-sm font-semibold">{fmtDate(g.date)}</h3>
          {g.runs.map((r) => {
            const list = seats[runKey(r.shuttle.id, r.date)] ?? [];
            const mySeat = list.find((s) => s.profile_id === meId);
            const left = seatsLeft(r.shuttle.passengers, list.length);
            const open = canBook(r, list.length, nowIso);
            return (
              <div key={runKey(r.shuttle.id, r.date)} className={cn("rounded-lg border bg-card p-3", mySeat && "border-green-300")}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs">{localTime(r.departAt)}</span>
                  <span className="font-medium">{r.shuttle.name}</span>
                  <span>
                    {r.shuttle.pickup} → {r.shuttle.dropoff}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      left === 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Users className="h-3 w-3" /> {list.length}/{r.shuttle.passengers} · {left === 0 ? "full" : `${left} free`}
                  </span>
                  {r.shuttle.driver_name && <span className="text-xs text-muted-foreground">driver {r.shuttle.driver_name}</span>}
                  <span className="ml-auto">
                    {mySeat ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => cancelSeat(mySeat.id))}>
                        Give my seat back
                      </Button>
                    ) : (
                      <Button size="sm" disabled={pending || !open} onClick={() => run(() => bookSeat(r.shuttle.id, r.date))}>
                        {open ? "Take a seat" : "Full"}
                      </Button>
                    )}
                  </span>
                </div>
                {list.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {list.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                        {s.profile_name ?? "—"}
                        {isAdmin && s.profile_id !== meId && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              if (confirm(`Free ${s.profile_name ?? "this"} seat on ${r.shuttle.name}?`)) run(() => cancelSeat(s.id));
                            }}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Free this seat"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function fmtDate(dateIso: string): string {
  return new Date(dateIso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
