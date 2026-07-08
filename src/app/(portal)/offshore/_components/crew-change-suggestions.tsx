"use client";

import { useEffect, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { CalendarClock, Pencil, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CrewChangePrefill, CrewChangeSuggestion, TripMode } from "@/types/offshore";
import {
  demobiliseCrew,
  demobiliseSelected,
  getCrewChangePrefill,
  mobiliseCrew,
  mobiliseCrewManual,
} from "../actions";

/** Schedule-driven prompts shown to offshore managers on the dashboard. Each
 *  row opens in the tenant's default mode ('auto' | 'manual'). */
export function CrewChangeSuggestions({
  items,
  defaultMode = "auto",
}: {
  items: CrewChangeSuggestion[];
  defaultMode?: TripMode;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = items.filter((s) => !dismissed.has(s.crew_id + s.action));
  if (visible.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <CalendarClock className="h-4 w-4" /> Crew changes due
      </div>
      {visible.map((s) => (
        <SuggestionRow
          key={s.crew_id + s.action}
          s={s}
          defaultMode={defaultMode}
          onDismiss={() => setDismissed((d) => new Set(d).add(s.crew_id + s.action))}
        />
      ))}
    </section>
  );
}

function SuggestionRow({
  s,
  defaultMode,
  onDismiss,
}: {
  s: CrewChangeSuggestion;
  defaultMode: TripMode;
  onDismiss: () => void;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TripMode>(defaultMode);
  const [prefill, setPrefill] = useState<CrewChangePrefill | null>(null);

  function loadPrefill() {
    if (prefill) return;
    setError(null);
    startTransition(async () => {
      const res = await getCrewChangePrefill(s.crew_id, s.action);
      if (res.ok) setPrefill(res.data);
      else setError(res.error ?? "Could not load the crew.");
    });
  }

  // When the tenant default is 'manual', open the editor straight away.
  useEffect(() => {
    if (defaultMode === "manual") loadPrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runAuto() {
    setError(null);
    startTransition(async () => {
      const res =
        s.action === "mobilise" ? await mobiliseCrew(s.crew_id) : await demobiliseCrew(s.crew_id);
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  function openManual() {
    setMode("manual");
    loadPrefill();
  }

  return (
    <div className="rounded-md border border-amber-200 bg-white/60 p-2">
      {error && <p className="mb-1 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
        <span className="min-w-0">
          <strong>{s.crew_name}</strong>{" "}
          {s.action === "mobilise" ? (
            <>is scheduled offshore since <strong>{s.since}</strong> but isn&apos;t boarded ({s.count} crew).</>
          ) : (
            <>is scheduled onshore since <strong>{s.since}</strong> but {s.count} are still on board.</>
          )}
        </span>

        <span className="ml-auto flex items-center gap-2">
          {/* Per crew change: run it automatically, or set it up by hand. */}
          <span className="inline-flex overflow-hidden rounded-md border border-amber-300 text-xs">
            <button
              type="button"
              onClick={() => setMode("auto")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1",
                mode === "auto" ? "bg-amber-200 font-medium text-amber-900" : "bg-white/70 text-amber-700",
              )}
            >
              <Zap className="h-3 w-3" /> Auto
            </button>
            <button
              type="button"
              onClick={openManual}
              className={cn(
                "inline-flex items-center gap-1 border-l border-amber-300 px-2 py-1",
                mode === "manual" ? "bg-amber-200 font-medium text-amber-900" : "bg-white/70 text-amber-700",
              )}
            >
              <Pencil className="h-3 w-3" /> Manual
            </button>
          </span>

          {mode === "auto" && (
            <Button size="sm" disabled={pending} onClick={runAuto}>
              {s.action === "mobilise" ? `Mobilise ${s.count}` : `Demobilise ${s.count}`}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={pending} onClick={onDismiss}>
            Dismiss
          </Button>
        </span>
      </div>

      {mode === "manual" && (
        <ManualEditor
          action={s.action}
          crewId={s.crew_id}
          prefill={prefill}
          pending={pending}
          onError={setError}
          run={startTransition}
        />
      )}
    </div>
  );
}

function ManualEditor({
  action,
  crewId,
  prefill,
  pending,
  onError,
  run,
}: {
  action: "mobilise" | "demobilise";
  crewId: string;
  prefill: CrewChangePrefill | null;
  pending: boolean;
  onError: (e: string | null) => void;
  run: (fn: () => Promise<void>) => void;
}) {
  // Pre-fill from the schedule; for mobilise, default-select people not already
  // aboard; for demobilise, everyone aboard is offered (all selected).
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [mobDate, setMobDate] = useState("");
  const [demobDate, setDemobDate] = useState("");

  // Seed editable state once the prefill arrives.
  useEffect(() => {
    if (!prefill) return;
    setPicked(
      new Set(
        action === "mobilise"
          ? prefill.members.filter((m) => !m.aboard).map((m) => m.profileId)
          : prefill.members.map((m) => m.profileId),
      ),
    );
    setMobDate(prefill.mobilizeDate);
    setDemobDate(prefill.demobDate ?? "");
  }, [prefill, action]);

  if (!prefill) {
    return <p className="mt-2 text-xs text-amber-700">Loading the crew…</p>;
  }
  if (prefill.members.length === 0) {
    return (
      <p className="mt-2 text-xs text-amber-700">
        {action === "mobilise" ? "This crew has no roster members." : "Nobody from this crew is on board."}
      </p>
    );
  }

  const sel = picked ?? new Set<string>();
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function submit() {
    onError(null);
    const ids = [...sel];
    if (ids.length === 0) {
      onError("Select at least one person.");
      return;
    }
    run(async () => {
      if (action === "mobilise") {
        const members = prefill!.members
          .filter((m) => sel.has(m.profileId))
          .map((m) => ({ profileId: m.profileId, roomId: m.roomId, bed: m.bed }));
        const res = await mobiliseCrewManual({
          crewId,
          mobilizeDate: mobDate,
          demobDate: demobDate || null,
          members,
        });
        if (!res.ok) onError(res.error ?? "Could not mobilise.");
      } else {
        const res = await demobiliseSelected({ crewId, demobDate: demobDate || null, profileIds: ids });
        if (!res.ok) onError(res.error ?? "Could not demobilise.");
      }
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-amber-200 bg-white/70 p-2">
      <div className="flex flex-wrap items-end gap-2">
        {action === "mobilise" && (
          <label className="text-[11px] text-amber-800">
            Mobilise date
            <input
              type="date"
              value={mobDate}
              onChange={(e) => setMobDate(e.target.value)}
              className="mt-0.5 block rounded border bg-background px-2 py-1 text-sm"
            />
          </label>
        )}
        <label className="text-[11px] text-amber-800">
          {action === "mobilise" ? "Demob date (planned)" : "Demob date"}
          <input
            type="date"
            value={demobDate}
            onChange={(e) => setDemobDate(e.target.value)}
            className="mt-0.5 block rounded border bg-background px-2 py-1 text-sm"
          />
        </label>
        <span className="ml-auto text-[11px] text-amber-700">{sel.size} selected</span>
      </div>

      <ul className="max-h-56 space-y-0.5 overflow-y-auto">
        {prefill.members.map((m) => {
          const disabled = action === "mobilise" && m.aboard;
          return (
            <li key={m.profileId}>
              <label
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1 text-sm",
                  disabled ? "opacity-50" : "cursor-pointer hover:bg-amber-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={sel.has(m.profileId)}
                  disabled={pending || disabled}
                  onChange={() => toggle(m.profileId)}
                />
                <span className="font-medium">{m.name}</span>
                {m.roomLabel && (
                  <span className="text-xs text-muted-foreground">
                    {m.roomLabel}
                    {m.bed ? ` · ${m.bed}` : ""}
                  </span>
                )}
                {disabled && <span className="text-[11px] text-green-700">already aboard</span>}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-amber-700">
          Cabins carry from the roster — adjust them on the board after boarding.
        </span>
        <Button size="sm" disabled={pending || sel.size === 0} onClick={submit}>
          {action === "mobilise" ? `Mobilise ${sel.size}` : `Demobilise ${sel.size}`}
        </Button>
      </div>
    </div>
  );
}
