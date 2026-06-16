"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarPlus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  EntitlementCandidate,
  MealEntitlement,
  MealEntitlementExtra,
} from "@/types/canteen";
import {
  addVisitorExtra,
  grantEntitlement,
  removeEntitlement,
  removeVisitorExtra,
  setEntitlementActive,
  updateEntitlementMeals,
} from "../actions";

type Result = { ok: boolean; error?: string };

function personLabel(name: string | null, email: string): string {
  return name?.trim() ? name : email;
}

export function EntitlementsManager({
  roster,
  extras,
  candidates,
}: {
  roster: MealEntitlement[];
  extras: MealEntitlementExtra[];
  candidates: EntitlementCandidate[];
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

      <AddEmployee candidates={candidates} run={run} pending={pending} />
      <Roster roster={roster} run={run} pending={pending} />
      <VisitorExtras roster={roster} extras={extras} run={run} pending={pending} />
    </div>
  );
}

function AddEmployee({
  candidates,
  run,
  pending,
}: {
  candidates: EntitlementCandidate[];
  run: (fn: () => Promise<Result>, onOk?: () => void) => void;
  pending: boolean;
}) {
  const [profileId, setProfileId] = useState("");
  const [meals, setMeals] = useState("1");

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Add an employee</h2>
      <form
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => grantEntitlement(profileId, Number(meals) || 1),
            () => {
              setProfileId("");
              setMeals("1");
            },
          );
        }}
      >
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          required
          className="rounded-md border bg-background px-2 py-2 text-sm"
        >
          <option value="">Select an employee…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {personLabel(c.full_name, c.email)}
              {c.job_title ? ` · ${c.job_title}` : ""}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          meals/day
          <input
            type="number"
            min={0}
            max={10}
            value={meals}
            onChange={(e) => setMeals(e.target.value)}
            className="w-16 rounded-md border bg-background px-2 py-2 text-sm"
          />
        </label>
        <Button type="submit" disabled={pending || !profileId}>
          <UserPlus className="h-4 w-4" /> Add
        </Button>
      </form>
      {candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Every active employee already has an entitlement.
        </p>
      )}
    </section>
  );
}

function Roster({
  roster,
  run,
  pending,
}: {
  roster: MealEntitlement[];
  run: (fn: () => Promise<Result>, onOk?: () => void) => void;
  pending: boolean;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">
        Entitled employees{" "}
        <span className="text-sm font-normal text-muted-foreground">
          ({roster.length})
        </span>
      </h2>
      {roster.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No employees are entitled yet. Add one above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Meals / working day</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last renewed</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.map((e) => (
                <tr key={e.id} className={cn(!e.is_active && "opacity-60")}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{personLabel(e.full_name, e.email)}</div>
                    {e.job_title && (
                      <div className="text-xs text-muted-foreground">{e.job_title}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      defaultValue={e.daily_meals}
                      disabled={pending}
                      onBlur={(ev) => {
                        const v = Number(ev.target.value);
                        if (v !== e.daily_meals) run(() => updateEntitlementMeals(e.id, v));
                      }}
                      className="w-16 rounded-md border bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setEntitlementActive(e.id, !e.is_active))}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        e.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {e.is_active ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.last_renewed_on ?? "—"}
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

function VisitorExtras({
  roster,
  extras,
  run,
  pending,
}: {
  roster: MealEntitlement[];
  extras: MealEntitlementExtra[];
  run: (fn: () => Promise<Result>, onOk?: () => void) => void;
  pending: boolean;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [profileId, setProfileId] = useState("");
  const [extraMeals, setExtraMeals] = useState("1");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [reason, setReason] = useState("");

  // Hosts must already be entitled; visitor meals top up an active employee.
  const hosts = roster.filter((e) => e.is_active);

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Visitor top-ups</h2>
      <p className="text-sm text-muted-foreground">
        Temporarily add extra meals per working day for an employee hosting a
        visitor. The top-up applies only within the date range, then reverts.
      </p>

      <form
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addVisitorExtra({ profileId, extraMeals: Number(extraMeals) || 1, startsOn, endsOn, reason }),
            () => {
              setProfileId("");
              setExtraMeals("1");
              setReason("");
            },
          );
        }}
      >
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          required
          className="rounded-md border bg-background px-2 py-2 text-sm lg:col-span-2"
        >
          <option value="">Host employee…</option>
          {hosts.map((h) => (
            <option key={h.id} value={h.profile_id}>
              {personLabel(h.full_name, h.email)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          +meals
          <input
            type="number"
            min={1}
            max={50}
            value={extraMeals}
            onChange={(e) => setExtraMeals(e.target.value)}
            className="w-16 rounded-md border bg-background px-2 py-2 text-sm"
          />
        </label>
        <input
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          required
          className="rounded-md border bg-background px-2 py-2 text-sm"
        />
        <input
          type="date"
          value={endsOn}
          min={startsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          required
          className="rounded-md border bg-background px-2 py-2 text-sm"
        />
        <Button type="submit" disabled={pending || !profileId}>
          <CalendarPlus className="h-4 w-4" /> Add
        </Button>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason / visitor name (optional)"
          className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-6"
        />
      </form>

      {hosts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add an entitled employee above before granting visitor top-ups.
        </p>
      )}

      {extras.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Host</th>
                <th className="px-4 py-2 font-medium">Extra / day</th>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">To</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {extras.map((x) => (
                <tr key={x.id}>
                  <td className="px-4 py-2 font-medium">
                    {personLabel(x.full_name, x.email)}
                  </td>
                  <td className="px-4 py-2">+{x.extra_meals}</td>
                  <td className="px-4 py-2 text-muted-foreground">{x.starts_on}</td>
                  <td className="px-4 py-2 text-muted-foreground">{x.ends_on}</td>
                  <td className="px-4 py-2 text-muted-foreground">{x.reason ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      aria-label="Cancel top-up"
                      disabled={pending}
                      onClick={() => run(() => removeVisitorExtra(x.id))}
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
