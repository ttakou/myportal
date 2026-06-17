"use client";

import { useMemo, useState, useTransition } from "react";
import { Plane, Plus, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/components/permissions-provider";
import type { Installation } from "@/types/offshore";
import { VISIT_STATUS_LABEL, type VisitRequest } from "@/types/offshore";
import { createVisitGroup } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

// --- de-duplication helpers --------------------------------------------------
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[m][n];
}

/** Find a similar-but-not-identical existing value to warn about. */
function findSimilar(input: string, list: string[]): { value: string; kind: "same" | "similar" } | null {
  const t = input.trim();
  if (t.length < 2) return null;
  const lower = t.toLowerCase();
  if (list.some((x) => x.toLowerCase() === lower)) return null; // exact — using existing, fine
  const ni = norm(t);
  const reorder = list.find((x) => norm(x) === ni);
  if (reorder) return { value: reorder, kind: "same" };
  let best: string | null = null;
  let bestD = 99;
  for (const x of list) {
    const d = lev(lower, x.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = x;
    }
  }
  if (best && bestD <= 2) return { value: best, kind: "similar" };
  return null;
}

type V = { name: string; company: string; gender: string; ice: string };
const blank = (): V => ({ name: "", company: "", gender: "any", ice: "" });

/** Host-facing: raise ONE offshore visit request for several visitors. */
export function VisitorRequestForm({
  installations,
  mine,
  nameSuggestions,
  companySuggestions,
}: {
  installations: Installation[];
  mine: VisitRequest[];
  nameSuggestions: string[];
  companySuggestions: string[];
}) {
  const { can } = usePermissions();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [purpose, setPurpose] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostDept, setHostDept] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [overnight, setOvernight] = useState(true);
  const [visitors, setVisitors] = useState<V[]>([blank()]);

  const setCount = (n: number) => {
    const count = Math.max(1, Math.min(50, n || 1));
    setVisitors((cur) => {
      if (count === cur.length) return cur;
      if (count < cur.length) return cur.slice(0, count);
      return [...cur, ...Array.from({ length: count - cur.length }, blank)];
    });
  };
  const setV = (i: number, patch: Partial<V>) =>
    setVisitors((cur) => cur.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createVisitGroup({
        purpose,
        installationId: installationId || undefined,
        hostName,
        hostDepartment: hostDept,
        departDate,
        returnDate: returnDate || undefined,
        overnight,
        visitors: visitors
          .filter((v) => v.name.trim())
          .map((v) => ({ name: v.name, company: v.company, gender: v.gender, emergencyContact: v.ice })),
      });
      if (!res.ok) {
        setError(res.error ?? "Could not submit request.");
        return;
      }
      setPurpose("");
      setInstallationId("");
      setHostName("");
      setHostDept("");
      setDepartDate("");
      setReturnDate("");
      setVisitors([blank()]);
      setOpen(false);
    });
  }

  // Group my requests by group_id for display.
  const groups = useMemo(() => {
    const map = new Map<string, VisitRequest[]>();
    for (const v of mine) {
      const k = v.group_id ?? v.id;
      map.set(k, [...(map.get(k) ?? []), v]);
    }
    return [...map.values()];
  }, [mine]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Offshore visitor requests</h2>
        {can("offshore", "create") && (
          <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((o) => !o)}>
            <Plane className="h-4 w-4" /> {open ? "Close" : "Request a visit"}
          </Button>
        )}
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {open && can("offshore", "create") && (
        <form onSubmit={submit} className="space-y-3 rounded-lg border bg-card p-4">
          <datalist id="visitor-names">
            {nameSuggestions.map((n) => <option key={n} value={n} />)}
          </datalist>
          <datalist id="visitor-companies">
            {companySuggestions.map((c) => <option key={c} value={c} />)}
          </datalist>

          {/* Shared trip details */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose of visit" required className={`${field} sm:col-span-2 lg:col-span-3`} />
            <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} required className={field}>
              <option value="">Destination installation…</option>
              {installations.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Offshore host" className={field} />
            <input value={hostDept} onChange={(e) => setHostDept(e.target.value)} placeholder="Host department" className={field} />
            <label className="text-xs text-muted-foreground">
              Departure
              <input value={departDate} onChange={(e) => setDepartDate(e.target.value)} type="date" required className={`mt-1 w-full ${field}`} />
            </label>
            <label className="text-xs text-muted-foreground">
              Return
              <input value={returnDate} onChange={(e) => setReturnDate(e.target.value)} type="date" className={`mt-1 w-full ${field}`} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={overnight} onChange={(e) => setOvernight(e.target.checked)} />
              Overnight (needs beds)
            </label>
          </div>

          {/* Visitors */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Visitors</span>
            <input
              type="number"
              min={1}
              value={visitors.length}
              onChange={(e) => setCount(Number(e.target.value))}
              className={`${field} w-20 py-1`}
              title="Number of visitors"
            />
          </div>

          <div className="space-y-2">
            {visitors.map((v, i) => {
              const nameHit = findSimilar(v.name, nameSuggestions);
              const compHit = findSimilar(v.company, companySuggestions);
              return (
                <div key={i} className="rounded-md border p-2">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <input
                        list="visitor-names"
                        value={v.name}
                        onChange={(e) => setV(i, { name: e.target.value })}
                        placeholder={`Visitor ${i + 1} full name`}
                        required={i === 0}
                        className={`${field} w-full`}
                      />
                      {nameHit && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {nameHit.kind === "same" ? "Already exists:" : "Similar to:"}{" "}
                          <button type="button" className="underline" onClick={() => setV(i, { name: nameHit.value })}>
                            {nameHit.value}
                          </button>
                        </p>
                      )}
                    </div>
                    <div>
                      <input
                        list="visitor-companies"
                        value={v.company}
                        onChange={(e) => setV(i, { company: e.target.value })}
                        placeholder="Company"
                        className={`${field} w-full`}
                      />
                      {compHit && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {compHit.kind === "same" ? "Use existing:" : "Similar:"}{" "}
                          <button type="button" className="underline" onClick={() => setV(i, { company: compHit.value })}>
                            {compHit.value}
                          </button>
                        </p>
                      )}
                    </div>
                    <select value={v.gender} onChange={(e) => setV(i, { gender: e.target.value })} className={field}>
                      <option value="any">Gender…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <input value={v.ice} onChange={(e) => setV(i, { ice: e.target.value })} placeholder="Emergency contact" className={`${field} w-full`} />
                      {visitors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setVisitors((cur) => cur.filter((_, idx) => idx !== i))}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button type="button" size="sm" variant="outline" onClick={() => setVisitors((cur) => [...cur, blank()])}>
              <Plus className="h-4 w-4" /> Add visitor
            </Button>
            <Button type="submit" disabled={pending}>
              Submit request ({visitors.filter((v) => v.name.trim()).length})
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            One request is sent for all listed visitors; the OIM approves it before they can be added to a manifest.
          </p>
        </form>
      )}

      {groups.length > 0 && (
        <div className="space-y-2">
          {groups.map((g) => {
            const head = g[0];
            const status = head.status;
            return (
              <div key={head.group_id ?? head.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.length === 1 ? g[0].visitor_name : `${g.length} visitors`}</span>
                  <span className="text-xs text-muted-foreground">
                    {head.installation_name ?? "—"} · {head.depart_date}
                    {head.return_date ? ` → ${head.return_date}` : ""}
                    {head.purpose ? ` · ${head.purpose}` : ""}
                  </span>
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium",
                      status === "returned"
                        ? "bg-green-100 text-green-700"
                        : status === "rejected" || status === "cancelled"
                          ? "bg-destructive/10 text-destructive"
                          : status === "approved" || status === "onboard"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                    )}
                  >
                    {VISIT_STATUS_LABEL[status]}
                  </span>
                </div>
                {g.length > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {g.map((v) => v.visitor_name).join(", ")}
                  </p>
                )}
                {status === "rejected" && head.reject_reason && (
                  <p className="mt-1 text-xs text-destructive">{head.reject_reason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
