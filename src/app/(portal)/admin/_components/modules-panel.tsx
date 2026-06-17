"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TenantModule } from "@/lib/admin";
import { setModuleActive } from "../actions";

export function ModulesPanel({ modules }: { modules: TenantModule[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function toggle(m: TenantModule) {
    if (m.is_core) return;
    setError(null);
    startTransition(async () => {
      const res = await setModuleActive(m.service_id, !m.is_active);
      if (!res.ok) setError(res.error ?? "Failed to update module.");
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Modules</h2>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <div
            key={m.service_id}
            className={cn(
              "flex items-start justify-between gap-3 rounded-lg border p-4",
              m.is_active ? "bg-card" : "bg-muted/40",
            )}
          >
            <div>
              <p className="font-medium">{m.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {m.description}
              </p>
            </div>
            {m.is_core ? (
              <span
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                title="Core module — always enabled"
              >
                <Lock className="h-3.5 w-3.5" />
              </span>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={m.is_active}
                disabled={pending}
                onClick={() => toggle(m)}
                className={cn(
                  "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                  m.is_active ? "bg-primary" : "bg-input",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                    m.is_active ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
