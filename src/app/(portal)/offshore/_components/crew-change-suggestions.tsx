"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CrewChangeSuggestion } from "@/types/offshore";
import { demobiliseCrew, mobiliseCrew } from "../actions";

/** Schedule-driven prompts shown to offshore managers on the dashboard. */
export function CrewChangeSuggestions({ items }: { items: CrewChangeSuggestion[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = items.filter((s) => !dismissed.has(s.crew_id + s.action));
  if (visible.length === 0) return null;

  function act(s: CrewChangeSuggestion) {
    setError(null);
    startTransition(async () => {
      const res = s.action === "mobilise" ? await mobiliseCrew(s.crew_id) : await demobiliseCrew(s.crew_id);
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <CalendarClock className="h-4 w-4" /> Crew changes due
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {visible.map((s) => (
        <div key={s.crew_id + s.action} className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
          <span>
            <strong>{s.crew_name}</strong>{" "}
            {s.action === "mobilise" ? (
              <>is scheduled offshore since <strong>{s.since}</strong> but isn&apos;t boarded ({s.count} crew).</>
            ) : (
              <>is scheduled onshore since <strong>{s.since}</strong> but {s.count} are still on board.</>
            )}
          </span>
          <span className="ml-auto flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => act(s)}>
              {s.action === "mobilise" ? `Mobilise ${s.count}` : `Demobilise ${s.count}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setDismissed((d) => new Set(d).add(s.crew_id + s.action))}
            >
              Dismiss
            </Button>
          </span>
        </div>
      ))}
    </section>
  );
}
