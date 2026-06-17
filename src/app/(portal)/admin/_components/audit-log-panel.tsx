"use client";

import { Fragment, useEffect, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { fetchAuditLog, type AuditEntry } from "../actions";

const TABLES = [
  "profiles", "profile_roles", "profile_access_roles", "tenant_services", "tenant_roles",
  "offshore_trips", "offshore_staff", "offshore_crews", "offshore_rooms", "offshore_manifests",
  "offshore_manifest_pax", "offshore_visit_requests", "offshore_bed_allocations", "offshore_emergency_roles",
  "offshore_installations", "offshore_meal_entries", "helicopter_flights",
  "canteen_bookings", "canteen_dishes", "canteen_options", "canteen_feedback",
  "transport_requests", "transport_vehicles", "transport_drivers",
  "loans", "loan_repayments", "savings_accounts", "savings_transactions",
  "medical_records", "perf_feedback", "okr_objectives", "okr_key_results", "nine_box",
  "out_of_town_trips", "trip_expenses", "trip_checkins", "visitors", "airport_assistance",
  "eess_incidents", "eess_broadcasts",
];

const OP_STYLE: Record<string, string> = {
  INSERT: "bg-green-100 text-green-700",
  UPDATE: "bg-amber-100 text-amber-700",
  DELETE: "bg-destructive/10 text-destructive",
};

/** Tenant-wide audit trail (super/tenant admins). */
export function AuditLogPanel() {
  const [pending, start] = useStatusTransition("Loading…", "load");
  const [table, setTable] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = (tableName: string) =>
    start(async () => {
      setError(null);
      const res = await fetchAuditLog({ tableName: tableName || undefined, limit: 150 });
      if (!res.ok) setError(res.error ?? "Failed to load.");
      else setEntries(res.entries ?? []);
    });

  useEffect(() => {
    load(table);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const summary = (e: AuditEntry) => {
    if (!e.changes) return "—";
    if (e.op === "UPDATE") return Object.keys(e.changes).join(", ");
    return e.op === "INSERT" ? "created" : "deleted";
  };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Audit trail</h2>
        <div className="flex items-center gap-2">
          <select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All tables</option>
            {TABLES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button onClick={() => load(table)} disabled={pending} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            {pending ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When (UTC)</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Op</th>
              <th className="px-3 py-2 font-medium">Changed</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((e) => (
              <Fragment key={e.id}>
                <tr
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                >
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(e.at).toLocaleString("en-GB", { timeZone: "UTC" })}
                  </td>
                  <td className="px-3 py-1.5">{e.actor_name ?? "system"}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{e.table_name}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${OP_STYLE[e.op] ?? "bg-muted"}`}>
                      {e.op}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{summary(e)}</td>
                </tr>
                {open === e.id && e.changes && (
                  <tr>
                    <td colSpan={5} className="bg-muted/20 px-3 py-2">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                        {JSON.stringify(e.changes, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {entries.length === 0 && !pending && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No audit entries.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
