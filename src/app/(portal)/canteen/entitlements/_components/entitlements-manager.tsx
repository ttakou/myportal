"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarPlus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  EntitlementCandidate,
  EntitlementStatus,
  MealEntitlement,
} from "@/types/canteen";
import { grantEntitlements, removeEntitlement } from "../actions";

type Result = { ok: boolean; error?: string };

function personLabel(name: string | null, email: string): string {
  return name?.trim() ? name : email;
}

const STATUS_STYLE: Record<EntitlementStatus, string> = {
  active: "bg-green-100 text-green-700",
  upcoming: "bg-blue-100 text-blue-700",
  expired: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<EntitlementStatus, string> = {
  active: "Active",
  upcoming: "Upcoming",
  expired: "Expired",
};

export function EntitlementsManager({
  entitlements,
  employees,
}: {
  entitlements: MealEntitlement[];
  employees: EntitlementCandidate[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<Result>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <GrantForm employees={employees} run={run} pending={pending} />
      <EntitlementsTable entitlements={entitlements} run={run} pending={pending} />
    </div>
  );
}

function GrantForm({
  employees,
  run,
  pending,
}: {
  employees: EntitlementCandidate[];
  run: (fn: () => Promise<Result>, onOk?: () => void) => void;
  pending: boolean;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Unique, type-ahead-friendly label per employee → id.
  const idByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) {
      m.set(`${personLabel(e.full_name, e.email)} · ${e.email}`, e.id);
    }
    return m;
  }, [employees]);
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, personLabel(e.full_name, e.email));
    return m;
  }, [employees]);

  const [picked, setPicked] = useState<string[]>([]); // profile ids
  const [typed, setTyped] = useState("");
  const [meals, setMeals] = useState("1");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");

  function addTyped(value: string) {
    const id = idByLabel.get(value.trim());
    if (id && !picked.includes(id)) setPicked((cur) => [...cur, id]);
    setTyped("");
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Grant an entitlement</h2>
      <form
        className="space-y-3 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              grantEntitlements({
                profileIds: picked,
                dailyMeals: Number(meals) || 1,
                startsOn,
                endsOn,
                reason,
              }),
            () => {
              setPicked([]);
              setReason("");
              setEndsOn("");
              setMeals("1");
            },
          );
        }}
      >
        {/* Employee picker (add one or many for a group) */}
        <div>
          <label className="text-xs text-muted-foreground">
            Employees{" "}
            <span className="text-muted-foreground/70">
              — type to search, add as many as you like
            </span>
          </label>
          {picked.length > 0 && (
            <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
              {picked.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {nameById.get(id) ?? id}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setPicked((cur) => cur.filter((p) => p !== id))}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            list="all-employees"
            value={typed}
            onChange={(e) => {
              const v = e.target.value;
              // datalist selection fires a change with the full label.
              if (idByLabel.has(v.trim())) addTyped(v);
              else setTyped(v);
            }}
            placeholder="Add an employee…"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <datalist id="all-employees">
            {employees.map((e) => (
              <option key={e.id} value={`${personLabel(e.full_name, e.email)} · ${e.email}`}>
                {e.job_title ?? ""}
              </option>
            ))}
          </datalist>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            Meals / working day
            <input
              type="number"
              min={1}
              max={10}
              value={meals}
              onChange={(e) => setMeals(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              required
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={endsOn}
              min={startsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              required
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Onshore staff, Project X"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {picked.length === 0
              ? "Add one or more employees above."
              : `${picked.length} employee${picked.length > 1 ? "s" : ""} selected.`}
          </p>
          <Button type="submit" disabled={pending || picked.length === 0}>
            <CalendarPlus className="h-4 w-4" /> Grant ({picked.length})
          </Button>
        </div>
      </form>
    </section>
  );
}

function EntitlementsTable({
  entitlements,
  run,
  pending,
}: {
  entitlements: MealEntitlement[];
  run: (fn: () => Promise<Result>, onOk?: () => void) => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | EntitlementStatus>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entitlements.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (!q) return true;
      return (
        personLabel(e.full_name, e.email).toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [entitlements, query, filter]);

  const counts = useMemo(() => {
    const c = { all: entitlements.length, active: 0, upcoming: 0, expired: 0 };
    for (const e of entitlements) c[e.status] += 1;
    return c;
  }, [entitlements]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Entitlements{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({entitlements.length})
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "active", "upcoming", "expired"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize",
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {f} ({counts[f]})
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {entitlements.length === 0
            ? "No entitlements yet. Grant one above."
            : "No entitlements match your filter."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Meals / day</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Granted by</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.id} className={cn(e.status === "expired" && "opacity-60")}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{personLabel(e.full_name, e.email)}</div>
                    {e.job_title && (
                      <div className="text-xs text-muted-foreground">{e.job_title}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">{e.daily_meals}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.starts_on} → {e.ends_on}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        STATUS_STYLE[e.status],
                      )}
                    >
                      {STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.granted_by_name ?? "—"}
                    <div className="text-xs">{e.granted_at?.slice(0, 10)}</div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      aria-label="Remove"
                      disabled={pending}
                      onClick={() => run(() => removeEntitlement(e.id))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
