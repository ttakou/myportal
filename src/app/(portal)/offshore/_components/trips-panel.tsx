"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import {
  OFFSHORE_STATUS_LABEL,
  type Flight,
  type OffshoreStatus,
  type OffshoreTrip,
} from "@/types/offshore";
import { addFlight, assignManifest, clearHse, setOffshoreStatus } from "../actions";

const STATUS_STYLE: Record<OffshoreStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  hse_cleared: "bg-accent text-accent-foreground",
  manifested: "bg-primary/10 text-primary",
  onboard: "bg-green-100 text-green-700",
  demobilised: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive line-through",
};
function Badge({ status }: { status: OffshoreStatus }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[status])}>
      {OFFSHORE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Per-trip logistics desk: the individual (often ad-hoc / visitor) trip pipeline
 * — clear HSE, book a flight + bed, then board and demobilise. The crew-based
 * flow (Crew Rotation, Manifests) handles rotations in bulk; this is the
 * one-person-at-a-time view. Adding flights is admin-only (matches the DB).
 */
export function TripsPanel({
  all,
  flights,
  canAddFlight,
}: {
  all: OffshoreTrip[];
  flights: Flight[];
  canAddFlight: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [fDate, setFDate] = useState("");
  const [fRoute, setFRoute] = useState("");
  const [fSeats, setFSeats] = useState("12");
  const allReveal = useProgressiveReveal(all.length);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Individual trip logistics — clear HSE, assign a flight &amp; bed, then board or demobilise each
        person. For rotating crews use Crew Rotation and Manifests instead.
      </p>

      <section className="space-y-3">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Person / Installation</th>
                <th className="px-4 py-3 font-medium">HSE</th>
                <th className="px-4 py-3 font-medium">Manifest</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {all.slice(0, allReveal.count).map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.person_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{t.installation_name} · {t.mobilize_date}</div>
                  </td>
                  <td className="px-4 py-3">
                    {t.hse_cleared_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> Cleared
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => clearHse(t.id))}>
                        Clear HSE
                      </Button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <select
                        value={t.flight_id ?? ""}
                        disabled={pending || !t.hse_cleared_at}
                        onChange={(e) => run(() => assignManifest(t.id, e.target.value || null, t.bed_no))}
                        className="rounded-md border bg-background px-1.5 py-1 text-xs"
                      >
                        <option value="">Flight…</option>
                        {flights.map((f) => (
                          <option key={f.id} value={f.id}>{f.route} ({f.flight_date})</option>
                        ))}
                      </select>
                      <input
                        defaultValue={t.bed_no ?? ""}
                        placeholder="Bed"
                        disabled={pending || !t.hse_cleared_at}
                        onBlur={(e) => {
                          if (e.target.value !== (t.bed_no ?? "")) run(() => assignManifest(t.id, t.flight_id, e.target.value || null));
                        }}
                        className="w-16 rounded-md border bg-background px-1.5 py-1 text-xs"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge status={t.status} />
                      {t.mode === "manual" && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800" title="Crew change set up manually">
                          manual
                        </span>
                      )}
                      {t.status === "manifested" && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setOffshoreStatus(t.id, "onboard"))}>
                          Board
                        </Button>
                      )}
                      {t.status === "onboard" && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setOffshoreStatus(t.id, "demobilised"))}>
                          Demob
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {all.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No trips.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <ShowMore
          ref={allReveal.sentinelRef}
          hasMore={allReveal.hasMore}
          remaining={allReveal.remaining}
          onClick={allReveal.showMore}
          label="Show more trips"
        />
      </section>

      {canAddFlight && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addFlight({ flightDate: fDate, route: fRoute, seats: Number(fSeats) }),
              () => { setFDate(""); setFRoute(""); setFSeats("12"); },
            );
          }}
          className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4"
        >
          <span className="text-sm font-medium">Add flight:</span>
          <input value={fDate} onChange={(e) => setFDate(e.target.value)} type="date" required className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          <input value={fRoute} onChange={(e) => setFRoute(e.target.value)} placeholder="Route" required className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          <input value={fSeats} onChange={(e) => setFSeats(e.target.value)} type="number" min={1} className="w-20 rounded-md border bg-background px-2 py-1.5 text-sm" />
          <Button size="sm" type="submit" disabled={pending}>Add</Button>
        </form>
      )}
    </div>
  );
}
