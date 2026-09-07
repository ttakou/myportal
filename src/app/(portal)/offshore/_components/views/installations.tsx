"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/types/offshore";
import { setInstallationActive, upsertInstallation } from "../../actions";
import { field, useRun } from "./shared";

/**
 * Installations: the platforms and vessels the module tracks.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

export function InstallationsPanel({ installations }: { installations: Installation[] }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Platforms, rigs, FPSOs and vessels. POB capacity drives the over-capacity warnings on the
        dashboard.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Installation</th>
              <th className="px-4 py-2 font-medium">POB capacity</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {installations.map((i) => (
              <tr key={i.id} className={cn(i.is_active === false && "opacity-60")}>
                <td className="px-4 py-2">
                  <input
                    defaultValue={i.name}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== i.name) run(() => upsertInstallation({ id: i.id, name: v, pobCapacity: i.pob_capacity }));
                    }}
                    className={field}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    defaultValue={i.pob_capacity}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== i.pob_capacity) run(() => upsertInstallation({ id: i.id, name: i.name, pobCapacity: v }));
                    }}
                    className={`${field} w-24`}
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setInstallationActive(i.id, i.is_active === false))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      i.is_active === false
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {i.is_active === false ? "Retired" : "Active"}
                  </button>
                </td>
              </tr>
            ))}
            {installations.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No installations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => upsertInstallation({ name, pobCapacity: Number(capacity) || 0 }),
            () => {
              setName("");
              setCapacity("");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Installation (Platform A, FPSO…)" required className={field} />
        <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={0} placeholder="POB capacity" className={`${field} w-32`} />
        <Button type="submit" disabled={pending}>Add installation</Button>
      </form>
    </div>
  );
}
