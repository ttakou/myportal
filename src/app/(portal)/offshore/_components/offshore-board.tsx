"use client";

import { useState, useTransition } from "react";
import { Ship, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  OFFSHORE_STATUS_LABEL,
  type Flight,
  type Installation,
  type OffshoreStatus,
  type OffshoreTrip,
  type Pob,
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
  pob,
  isAdmin,
  people,
  meId,
}: {
  mine: OffshoreTrip[];
  all: OffshoreTrip[];
  installations: Installation[];
  flights: Flight[];
  pob: Pob[];
  isAdmin: boolean;
  people: { id: string; name: string }[];
  meId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [installationId, setInstallationId] = useState(installations[0]?.id ?? "");
  const [mobilize, setMobilize] = useState("");
  const [demob, setDemob] = useState("");
  // People on this request — defaults to the requester (self-service stays easy).
  const [rows, setRows] = useState<string[]>([meId]);

  const setRow = (i: number, id: string) =>
    setRows((cur) => cur.map((v, idx) => (idx === i ? id : v)));
  const addRow = () => setRows((cur) => [...cur, ""]);
  const removeRow = (i: number) => setRows((cur) => cur.filter((_, idx) => idx !== i));
  const selectedCount = new Set(rows.filter(Boolean)).size;

  const [fDate, setFDate] = useState("");
  const [fRoute, setFRoute] = useState("");
  const [fSeats, setFSeats] = useState("12");

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

      {isAdmin && pob.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">POB · persons on board</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pob.map((p) => {
              const over = p.pob > p.pob_capacity;
              return (
                <div key={p.installation_id} className="rounded-lg border bg-card p-4">
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {p.pob}
                    <span className="text-sm font-normal text-muted-foreground"> / {p.pob_capacity}</span>
                  </p>
                  {over && <p className="text-xs text-destructive">Over capacity</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Request an offshore trip</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                requestOffshoreTripGroup({
                  installationId,
                  mobilizeDate: mobilize,
                  demobDate: demob,
                  profileIds: rows.filter(Boolean),
                }),
              () => {
                setMobilize("");
                setDemob("");
                setRows([meId]);
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
            {rows.map((id, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={id}
                  onChange={(e) => setRow(i, e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">{i === 0 ? "Select a person…" : "Add another person…"}</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.id === meId ? " (me)" : ""}</option>
                  ))}
                </select>
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
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
            One request can cover several people — each gets their own trip to clear HSE and be manifested.
          </p>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My offshore trips</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Installation</th><th className="px-4 py-3 font-medium">Dates</th><th className="px-4 py-3 font-medium">Flight / Bed</th><th className="px-4 py-3 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {mine.map((t) => (
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
      </section>

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
                  {all.map((t) => (
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
