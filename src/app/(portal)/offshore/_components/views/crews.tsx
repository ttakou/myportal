"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { crewManifestPreview, nextCrewChangeDate } from "@/lib/offshore/crew-preview";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/types/offshore";
import {
  type Crew,
  type CrewChangeSuggestion,
  type PobOnboard,
  type RosterEntry,
} from "@/types/offshore";
import { deleteCrew, generateNextCrewChange, upsertCrew } from "../../actions";
import { field, useRun } from "./shared";

/**
 * Crew change: crews, their rotation cycles and the next change each
 * produces.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

/** Editable crew name with an explicit Save button (preserves rotation/cycle). */
function CrewNameEditor({
  c,
  pending,
  run,
}: {
  c: Crew;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState(c.name);
  const changed = name.trim().length > 0 && name.trim() !== c.name;
  const save = () => {
    if (!changed) return;
    run(() =>
      upsertCrew({
        id: c.id,
        name: name.trim(),
        installationId: c.installation_id ?? undefined,
        rotationPattern: c.rotation_pattern ?? undefined,
        offshoreDays: c.offshore_days,
        onshoreDays: c.onshore_days,
        transportMode: c.transport_mode ?? undefined,
        departureLocation: c.departure_location ?? undefined,
        cycleStartDate: c.cycle_start_date ?? null,
      }),
    );
  };
  return (
    <div className="flex flex-1 items-center gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        disabled={pending}
        className={cn(field, "flex-1 font-medium")}
      />
      <Button size="sm" variant="outline" disabled={pending || !changed} onClick={save}>
        Save
      </Button>
    </div>
  );
}

/**
 * Read-only passenger list for a crew: exactly who a generated crew manifest
 * would carry, plus the date each direction would be stamped with. Nothing here
 * writes — it exists so the list can be checked before a manifest is created.
 */
function CrewManifestPreview({
  crew,
  roster,
  onboard,
  today,
}: {
  crew: Crew;
  roster: RosterEntry[];
  onboard: PobOnboard[];
  today: string;
}) {
  const cycle = {
    offshore_days: crew.offshore_days,
    onshore_days: crew.onshore_days,
    cycle_start_date: crew.cycle_start_date,
  };
  const preview = crewManifestPreview({ crewId: crew.id, roster, onboard });
  const outDate = nextCrewChangeDate({ todayIso: today, direction: "out", cycle });
  const inDate = nextCrewChangeDate({ todayIso: today, direction: "in", cycle });

  return (
    <div className="mt-2 rounded-md border border-dashed bg-muted/30 p-2">
      <p className="text-[11px] text-muted-foreground">
        Preview only — nothing is created until you press a manifest button. Both buttons put the
        whole crew on the manifest.
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="font-medium">{preview.members.length} on the manifest</span>
        <span className="text-muted-foreground">{preview.onboardCount} already on board</span>
        <span className="text-muted-foreground">{preview.ashoreCount} ashore</span>
        {preview.blockedCount > 0 && (
          <span className="font-medium text-destructive">
            {preview.blockedCount} cannot travel — certificates
          </span>
        )}
      </div>
      {(outDate || inDate) && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Would be dated — Inbound (board): {outDate ?? "—"} · Outbound (demob): {inDate ?? "—"}
        </p>
      )}
      {preview.members.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Nobody is on this crew — a manifest cannot be generated.
        </p>
      ) : (
        <div className="mt-1 max-h-56 overflow-y-auto">
          {preview.members.map((m) => (
            <div
              key={m.profile_id}
              className="flex flex-wrap items-center gap-2 border-b py-1 text-xs last:border-0"
            >
              <span className="font-medium">{m.name}</span>
              {m.position && <span className="text-muted-foreground">{m.position}</span>}
              {!m.travel_eligible && (
                <span className="rounded bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive">
                  Cannot travel
                </span>
              )}
              <span className="ml-auto text-muted-foreground">
                {m.onboard ? `On board${m.room_label ? ` · ${m.room_label}` : ""}` : "Ashore"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrewsPanel({
  crews,
  installations,
  suggestions,
  roster,
  onboard,
}: {
  crews: Crew[];
  installations: Installation[];
  suggestions: CrewChangeSuggestion[];
  roster: RosterEntry[];
  onboard: PobOnboard[];
}) {
  // crew → which movement is due now (mobilise = outbound, demobilise = inbound)
  const dueByCrew = new Map(suggestions.map((s) => [s.crew_id, s.action]));
  const { pending, error, run } = useRun();
  // Which crew's passenger list is open. Looking is not the same as generating:
  // both manifest buttons write immediately, so this is the way to check the
  // list — and the dates — before creating anything.
  const [preview, setPreview] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [rotation, setRotation] = useState("14/14");
  const [transport, setTransport] = useState("");
  const [departure, setDeparture] = useState("");
  const [cycleStart, setCycleStart] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {crews.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <CrewNameEditor c={c} pending={pending} run={run} />
              <button
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete crew "${c.name}"? Members will be unassigned.`))
                    run(() => deleteCrew(c.id));
                }}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.installation_name ?? "No installation"} · {c.rotation_pattern || `${c.offshore_days}/${c.onshore_days}`}
              {c.transport_mode ? ` · ${c.transport_mode}` : ""}
              {c.departure_location ? ` · from ${c.departure_location}` : ""}
            </p>
            <button
              type="button"
              onClick={() => setPreview((cur) => (cur === c.id ? null : c.id))}
              aria-expanded={preview === c.id}
              className="mt-1 flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {c.member_count} member(s)
              <ChevronDown className={cn("h-3 w-3 transition-transform", preview === c.id && "rotate-180")} />
              <span>— see who is on the manifest</span>
            </button>
            {preview === c.id && (
              <CrewManifestPreview
                crew={c}
                roster={roster}
                onboard={onboard}
                today={today}
              />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">
                Cycle start
                <input
                  type="date"
                  defaultValue={c.cycle_start_date ?? ""}
                  disabled={pending}
                  onBlur={(e) => {
                    if (e.target.value !== (c.cycle_start_date ?? ""))
                      run(() =>
                        upsertCrew({
                          id: c.id,
                          name: c.name,
                          offshoreDays: c.offshore_days,
                          onshoreDays: c.onshore_days,
                          cycleStartDate: e.target.value || null,
                        }),
                      );
                  }}
                  className={`mt-1 block ${field}`}
                />
              </label>
              {c.next_change_date && (
                <span className="text-xs text-muted-foreground">
                  Next change: <span className="font-medium text-foreground">{c.next_change_date}</span>
                </span>
              )}
            </div>
            {c.cycle_start_date && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => generateNextCrewChange(c.id, "out"))}
                  className={cn(
                    dueByCrew.get(c.id) === "mobilise" &&
                      "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  title={dueByCrew.get(c.id) === "mobilise" ? "Mobilisation due" : undefined}
                >
                  Inbound manifest (board)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => generateNextCrewChange(c.id, "in"))}
                  className={cn(
                    dueByCrew.get(c.id) === "demobilise" &&
                      "border-green-600 bg-green-600 text-white hover:bg-green-700",
                  )}
                  title={dueByCrew.get(c.id) === "demobilise" ? "Demobilisation due" : undefined}
                >
                  Outbound manifest (demob)
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className="grid gap-2 rounded-lg border border-dashed bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const [off, on] = rotation.split("/").map((n) => parseInt(n, 10));
          run(
            () =>
              upsertCrew({
                name,
                installationId: installationId || undefined,
                rotationPattern: rotation,
                offshoreDays: off || 14,
                onshoreDays: on || off || 14,
                transportMode: transport,
                departureLocation: departure,
                cycleStartDate: cycleStart || null,
              }),
            () => {
              setName("");
              setTransport("");
              setDeparture("");
              setCycleStart("");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Crew name (Crew A)" required className={field} />
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className={field}>
          <option value="">Installation…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <input value={rotation} onChange={(e) => setRotation(e.target.value)} placeholder="Rotation (14/14)" className={field} />
        <input value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="Transport (helicopter)" className={field} />
        <input value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="Departure (Douala heliport)" className={field} />
        <label className="text-xs text-muted-foreground">
          Cycle start date
          <input value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} type="date" className={`mt-1 w-full ${field}`} />
        </label>
        <Button type="submit" disabled={pending}>Add crew</Button>
      </form>
    </div>
  );
}
