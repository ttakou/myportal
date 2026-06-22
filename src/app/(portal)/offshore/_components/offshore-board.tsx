"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Ship, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { usePermissions } from "@/components/permissions-provider";
import {
  OFFSHORE_STATUS_LABEL,
  type Flight,
  type Installation,
  type OffshoreStatus,
  type OffshoreTrip,
} from "@/types/offshore";
import {
  addFlight,
  assignManifest,
  clearHse,
  requestOffshoreTripGroup,
  setOffshoreStatus,
} from "../actions";

const STATUS_STYLE: Record<OffshoreStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  hse_cleared: "bg-accent text-accent-foreground",
  manifested: "bg-primary/10 text-primary",
  onboard: "bg-green-100 text-green-700",
  demobilised: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive line-through",
};
function Badge({ status }: { status: OffshoreStatus }) {
  return <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[status])}>{OFFSHORE_STATUS_LABEL[status]}</span>;
}

export function OffshoreBoard({
  mine,
  all,
  installations,
  flights,
  isAdmin,
  people,
  meId,
}: {
  mine: OffshoreTrip[];
  all: OffshoreTrip[];
  installations: Installation[];
  flights: Flight[];
  isAdmin: boolean;
  people: { id: string; name: string }[];
  meId: string;
}) {
  const { can } = usePermissions();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [installationId, setInstallationId] = useState(installations[0]?.id ?? "");
  const [mobilize, setMobilize] = useState("");
  const [demob, setDemob] = useState("");

  // Map a typed name back to an employee (case-insensitive); anything not found
  // is treated as a brand-new named person (visitor/contractor not in the system).
  const idByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) m.set(p.name.toLowerCase(), p.id);
    return m;
  }, [people]);
  const myName = people.find((p) => p.id === meId)?.name ?? "";

  // People on this request — defaults to the requester (self-service stays easy).
  // Each row holds a free-typed name that may match an employee or be new.
  const [rows, setRows] = useState<string[]>([myName]);

  const setRow = (i: number, name: string) =>
    setRows((cur) => cur.map((v, idx) => (idx === i ? name : v)));
  const addRow = () => setRows((cur) => [...cur, ""]);
  const removeRow = (i: number) => setRows((cur) => cur.filter((_, idx) => idx !== i));
  const selectedCount = rows.filter((r) => r.trim()).length;

  const [fDate, setFDate] = useState("");
  const [fRoute, setFRoute] = useState("");
  const [fSeats, setFSeats] = useState("12");

  const mineReveal = useProgressiveReveal(mine.length);
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
    <div className="space-y-8">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {/* The user's own trips lead the page (POB lives on the management dashboard). */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My offshore trips</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Installation</th><th className="px-4 py-3 font-medium">Dates</th><th className="px-4 py-3 font-medium">Flight / Bed</th><th className="px-4 py-3 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {mine.slice(0, mineReveal.count).map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium">{t.installation_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.mobilize_date}{t.demob_date ? ` → ${t.demob_date}` : ""}</td>
                  <td className="px-4 py-3 text-muted-foreground">{[t.flight_label, t.bed_no && `Bed ${t.bed_no}`].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-3"><Badge status={t.status} /></td>
                </tr>
              ))}
              {mine.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No trips yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <ShowMore
          ref={mineReveal.sentinelRef}
          hasMore={mineReveal.hasMore}
          remaining={mineReveal.remaining}
          onClick={mineReveal.showMore}
          label="Show more trips"
        />
      </section>

      {can("offshore", "create") && (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Request an offshore trip</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const entries = rows
              .map((r) => r.trim())
              .filter(Boolean)
              .map((name) => {
                const id = idByName.get(name.toLowerCase());
                return id ? { profileId: id } : { name };
              });
            run(
              () =>
                requestOffshoreTripGroup({
                  installationId,
                  mobilizeDate: mobilize,
                  demobDate: demob,
                  people: entries,
                }),
              () => {
                setMobilize("");
                setDemob("");
                setRows([myName]);
              },
            );
          }}
          className="space-y-3 rounded-lg border bg-card p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Installation
              <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                {installations.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Mobilise
              <input value={mobilize} onChange={(e) => setMobilize(e.target.value)} type="date" required className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-muted-foreground">
              Demob
              <input value={demob} onChange={(e) => setDemob(e.target.value)} type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">People on this trip</span>
            {rows.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  list="offshore-people"
                  value={name}
                  onChange={(e) => setRow(i, e.target.value)}
                  placeholder={
                    i === 0
                      ? "Type or pick a person…"
                      : "Type a new name, or pick an employee…"
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {/* Shared lookup list — matched names book the employee; anything
                else is recorded as a new named person (visitor/contractor). */}
            <datalist id="offshore-people">
              {people.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.id === meId ? `${p.name} (me)` : p.name}
                </option>
              ))}
            </datalist>
          </div>

          <div className="flex items-center justify-between">
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              <Plus className="h-4 w-4" /> Add person
            </Button>
            <Button type="submit" disabled={pending}>
              <Ship className="h-4 w-4" /> Request trip ({selectedCount})
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick an employee from the list, or type a new name for a visitor or
            contractor not yet in the system. One request can cover several
            people — each gets their own trip to clear HSE and be manifested.
          </p>
        </form>
      </section>
      )}

      {isAdmin && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Logistics · all trips</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3 font-medium">Person / Installation</th><th className="px-4 py-3 font-medium">HSE</th><th className="px-4 py-3 font-medium">Manifest</th><th className="px-4 py-3 font-medium">Status</th></tr>
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
                          <span className="inline-flex items-center gap-1 text-xs text-green-700"><ShieldCheck className="h-3.5 w-3.5" /> Cleared</span>
                        ) : (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => clearHse(t.id))}>Clear HSE</Button>
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
                            {flights.map((f) => <option key={f.id} value={f.id}>{f.route} ({f.flight_date})</option>)}
                          </select>
                          <input
                            defaultValue={t.bed_no ?? ""}
                            placeholder="Bed"
                            disabled={pending || !t.hse_cleared_at}
                            onBlur={(e) => { if (e.target.value !== (t.bed_no ?? "")) run(() => assignManifest(t.id, t.flight_id, e.target.value || null)); }}
                            className="w-16 rounded-md border bg-background px-1.5 py-1 text-xs"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge status={t.status} />
                          {t.status === "manifested" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setOffshoreStatus(t.id, "onboard"))}>Board</Button>}
                          {t.status === "onboard" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setOffshoreStatus(t.id, "demobilised"))}>Demob</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {all.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No trips.</td></tr>}
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

          <form
            onSubmit={(e) => { e.preventDefault(); run(() => addFlight({ flightDate: fDate, route: fRoute, seats: Number(fSeats) }), () => { setFDate(""); setFRoute(""); setFSeats("12"); }); }}
            className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4"
          >
            <span className="text-sm font-medium">Add flight:</span>
            <input value={fDate} onChange={(e) => setFDate(e.target.value)} type="date" required className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            <input value={fRoute} onChange={(e) => setFRoute(e.target.value)} placeholder="Route" required className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            <input value={fSeats} onChange={(e) => setFSeats(e.target.value)} type="number" min={1} className="w-20 rounded-md border bg-background px-2 py-1.5 text-sm" />
            <Button size="sm" type="submit" disabled={pending}>Add</Button>
          </form>
        </>
      )}
    </div>
  );
}
