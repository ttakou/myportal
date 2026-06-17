"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PobAsOf, RoomHistoryRow } from "@/types/offshore";
import { fetchPobAsOf, fetchRoomHistory } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function HistoryPanel() {
  const [pending, startTransition] = useStatusTransition("Loading…", "load");

  // POB as-of
  const [pobDate, setPobDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pob, setPob] = useState<PobAsOf | null>(null);

  // Room occupancy
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rooms, setRooms] = useState<RoomHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadPob() {
    setError(null);
    startTransition(async () => {
      const res = await fetchPobAsOf(pobDate);
      if (!res.ok) setError(res.error ?? "Failed.");
      else setPob(res.pob ?? null);
    });
  }
  function loadRooms() {
    setError(null);
    startTransition(async () => {
      const res = await fetchRoomHistory(from, to);
      if (!res.ok) setError(res.error ?? "Failed.");
      else setRooms(res.rows ?? null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">History</h3>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {/* POB as of a date */}
      <section className="space-y-2">
        <p className="text-sm font-medium">POB as of a date</p>
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" value={pobDate} onChange={(e) => setPobDate(e.target.value)} className={field} />
          <Button size="sm" disabled={pending} onClick={loadPob}>Show POB</Button>
        </div>
        {pob && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{pob.total} on board</span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{pob.staff} staff</span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{pob.visitor} visitors</span>
              <span className="text-xs text-muted-foreground">on {pob.date}</span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Installation</th>
                    <th className="px-3 py-2 font-medium">Crew</th>
                    <th className="px-3 py-2 font-medium">Muster</th>
                    <th className="px-3 py-2 font-medium">On board since</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pob.people.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{p.name}</td>
                      <td className="px-3 py-1.5 capitalize text-muted-foreground">{p.category}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{p.installation ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{p.crew ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{p.lifeboat ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {p.from}{p.to ? ` → ${p.to}` : ""}
                      </td>
                    </tr>
                  ))}
                  {pob.people.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No one on board on that date.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Room occupancy over a period */}
      <section className="space-y-2">
        <p className="text-sm font-medium">Room occupancy over a period</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 block ${field}`} /></label>
          <label className="text-xs text-muted-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1 block ${field}`} /></label>
          <Button size="sm" disabled={pending} onClick={loadRooms}>Show occupancy</Button>
        </div>
        {rooms && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Room</th>
                  <th className="px-3 py-2 font-medium">Installation</th>
                  <th className="px-3 py-2 font-medium">Occupant</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rooms.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-medium">{r.room_label}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.installation ?? "—"}</td>
                    <td className="px-3 py-1.5">{r.occupant}</td>
                    <td className="px-3 py-1.5 capitalize text-muted-foreground">{r.category}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {r.from} → {r.to ?? "present"}
                      {r.current && <span className="ml-1 rounded bg-green-100 px-1 text-[10px] text-green-700">current</span>}
                    </td>
                  </tr>
                ))}
                {rooms.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No room occupancy in that period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
