"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { type Crew, type Room, type RosterEntry } from "@/types/offshore";
import { addRosterMember, removeRosterMember, updateRosterMember } from "../../actions";
import { BulkRosterImport } from "../bulk-roster-import";
import { field, useRun } from "./shared";

/**
 * Offshore staff: the roster with crew, cabin, muster station and
 * certificates.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

export function RosterPanel({
  roster,
  crews,
  rooms,
  addable,
}: {
  roster: RosterEntry[];
  crews: Crew[];
  rooms: Room[];
  addable: { id: string; full_name: string }[];
}) {
  const { pending, error, run } = useRun();
  const [newId, setNewId] = useState("");
  const [repDate, setRepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const rosterReveal = useProgressiveReveal(roster.length);

  function expired(date: string | null) {
    return date ? new Date(date) < new Date() : false;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          As of
          <input type="date" value={repDate} onChange={(e) => setRepDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <Button size="sm" variant="outline" disabled={!repDate} onClick={() => window.open(`/offshore-roster?date=${repDate}`, "_blank")}>
          <FileText className="h-4 w-4" /> Roster &amp; room allocation report
        </Button>
      </div>

      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-card/50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addRosterMember(newId), () => setNewId(""));
        }}
      >
        <span className="text-sm font-medium">Add to roster:</span>
        <LazySelect
          value={newId || null}
          options={addable}
          getOptionValue={(p) => p.id}
          getOptionLabel={(p) => p.full_name}
          placeholder="Choose person…"
          className={field}
          onChange={(v) => setNewId(v ?? "")}
        />
        <Button type="submit" size="sm" disabled={pending || !newId}>Add</Button>
      </form>

      <BulkRosterImport />

      <div className="space-y-3">
        {roster.slice(0, rosterReveal.count).map((m) => (
          <div key={m.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.full_name || m.email}</span>
              {!m.travel_eligible && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                  Not eligible
                </span>
              )}
              {!m.is_rotational && (
                <span
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  title="Works offshore but sits outside the crew rotation — no crew, skipped by the rotation calendar."
                >
                  Non-rotational
                </span>
              )}
              {m.crew_name && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {m.crew_name}
                </span>
              )}
              {m.company && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {m.company}
                </span>
              )}
              {m.fixed_room_label && (
                <span className="text-xs text-muted-foreground">
                  Room {m.fixed_room_label}
                  {m.fixed_bed ? ` · ${m.fixed_bed}` : ""}
                </span>
              )}
              {m.lifeboat && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  {m.lifeboat}
                </span>
              )}
              {m.back_to_back_name && (
                <span className="text-xs text-muted-foreground">B2B: {m.back_to_back_name}</span>
              )}
              <button
                disabled={pending}
                onClick={() => run(() => removeRosterMember(m.id))}
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={m.crew_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateRosterMember({ id: m.id, crewId: e.target.value || null }))}
                className={field}
              >
                <option value="">Crew…</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                defaultValue={m.position ?? ""}
                disabled={pending}
                placeholder="Position"
                onBlur={(e) => {
                  if (e.target.value !== (m.position ?? "")) run(() => updateRosterMember({ id: m.id, position: e.target.value }));
                }}
                className={field}
              />
              <input
                defaultValue={m.company ?? ""}
                disabled={pending}
                placeholder="Company (APCC, TEFON…)"
                onBlur={(e) => {
                  if (e.target.value !== (m.company ?? "")) run(() => updateRosterMember({ id: m.id, company: e.target.value }));
                }}
                className={field}
              />
              <LazySelect
                value={m.back_to_back_id ?? null}
                options={roster.filter((o) => o.profile_id !== m.profile_id)}
                getOptionValue={(o) => o.profile_id}
                getOptionLabel={(o) => o.full_name || o.email || ""}
                placeholder="Back-to-back…"
                disabled={pending}
                className={field}
                onChange={(v) => run(() => updateRosterMember({ id: m.id, backToBackId: v }))}
              />
              <LazySelect
                value={m.fixed_room_id ?? null}
                options={rooms}
                getOptionValue={(r) => r.id}
                getOptionLabel={(r) => [r.block, r.room_number].filter(Boolean).join(" ")}
                placeholder="Fixed room…"
                disabled={pending}
                className={field}
                onChange={(v) => run(() => updateRosterMember({ id: m.id, fixedRoomId: v }))}
              />
              <input
                defaultValue={m.fixed_bed ?? ""}
                disabled={pending}
                placeholder="Fixed bed (Bed 1)"
                onBlur={(e) => {
                  if (e.target.value !== (m.fixed_bed ?? "")) run(() => updateRosterMember({ id: m.id, fixedBed: e.target.value }));
                }}
                className={field}
              />
              <div className={cn(field, "flex items-center gap-1 bg-muted/40")} title="Muster follows the fixed room">
                <span className="text-xs text-muted-foreground">Muster:</span>
                <span className="font-medium">{m.lifeboat ?? "— set on room —"}</span>
              </div>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <CertInput label="Medical" value={m.medical_expiry} expired={expired(m.medical_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, medicalExpiry: v }))} />
              <CertInput label="BOSIET" value={m.bosiet_expiry} expired={expired(m.bosiet_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, bosietExpiry: v }))} />
              <CertInput label="HUET" value={m.huet_expiry} expired={expired(m.huet_expiry)}
                onSave={(v) => run(() => updateRosterMember({ id: m.id, huetExpiry: v }))} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.travel_eligible}
                  disabled={pending}
                  onChange={(e) => run(() => updateRosterMember({ id: m.id, travelEligible: e.target.checked }))}
                />
                Travel eligible
              </label>
            </div>
          </div>
        ))}
        {roster.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No offshore staff on the roster yet.
          </p>
        )}
      </div>
      <ShowMore
        ref={rosterReveal.sentinelRef}
        hasMore={rosterReveal.hasMore}
        remaining={rosterReveal.remaining}
        onClick={rosterReveal.showMore}
        label="Show more roster members"
      />
    </div>
  );
}

function CertInput({
  label,
  value,
  expired,
  onSave,
}: {
  label: string;
  value: string | null;
  expired: boolean;
  onSave: (v: string) => void;
}) {
  return (
    <label className={cn("text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
      {label} expiry{expired ? " (expired)" : ""}
      <input
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          if (e.target.value !== (value ?? "")) onSave(e.target.value);
        }}
        className={cn(field, "mt-1 w-full", expired && "border-destructive")}
      />
    </label>
  );
}
