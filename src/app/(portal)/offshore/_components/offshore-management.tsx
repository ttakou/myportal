"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  BedDouble,
  CalendarClock,
  LayoutGrid,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/types/offshore";
import {
  GENDER_LABEL,
  ROOM_STATUS_LABEL,
  type AccommodationSummary,
  type CertAlert,
  type Crew,
  type GenderRestriction,
  type PobBreakdown,
  type Room,
  type RoomStatus,
  type RosterEntry,
} from "@/types/offshore";
import {
  addRosterMember,
  deleteCrew,
  removeRosterMember,
  setRoomStatus,
  updateRosterMember,
  upsertCrew,
  upsertRoom,
} from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
type Tab = "dashboard" | "crews" | "rooms" | "roster";

export function OffshoreManagement(props: {
  crews: Crew[];
  rooms: Room[];
  roster: RosterEntry[];
  installations: Installation[];
  addable: { id: string; full_name: string }[];
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
  certAlerts: CertAlert[];
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: "dashboard", label: "POB & dashboards", icon: LayoutGrid },
    { key: "crews", label: "Crew change", icon: CalendarClock },
    { key: "rooms", label: "Accommodation", icon: BedDouble },
    { key: "roster", label: "Offshore staff", icon: Users },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <Dashboard pob={props.pob} accommodation={props.accommodation} certAlerts={props.certAlerts} />
      )}
      {tab === "crews" && <CrewsPanel crews={props.crews} installations={props.installations} />}
      {tab === "rooms" && <RoomsPanel rooms={props.rooms} installations={props.installations} />}
      {tab === "roster" && (
        <RosterPanel
          roster={props.roster}
          crews={props.crews}
          rooms={props.rooms}
          addable={props.addable}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Dashboard({
  pob,
  accommodation,
  certAlerts,
}: {
  pob: PobBreakdown;
  accommodation: AccommodationSummary;
  certAlerts: CertAlert[];
}) {
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Persons on board
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Current POB" value={pob.total} />
          <Stat label="Offshore staff" value={pob.byCategory.staff} />
          <Stat label="Visitors" value={pob.byCategory.visitor} />
          <Stat label="Arrivals today" value={pob.arrivalsToday} />
          <Stat label="Departures today" value={pob.departuresToday} />
          <Stat label="Overstayers" value={pob.overstayers.length} />
        </div>
        {pob.byInstallation.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pob.byInstallation.map((i) => {
              const over = i.capacity > 0 && i.pob > i.capacity;
              return (
                <div key={i.name} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{i.name}</span>
                    <span className={cn("font-semibold", over && "text-destructive")}>
                      {i.pob}
                      {i.capacity > 0 ? ` / ${i.capacity}` : ""}
                    </span>
                  </div>
                  {i.capacity > 0 && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full", over ? "bg-destructive" : "bg-primary")}
                        style={{ width: `${Math.min(100, (i.pob / i.capacity) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {pob.byCrew.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            By crew: {pob.byCrew.map((c) => `${c.name} ${c.pob}`).join(" · ")}
          </p>
        )}
        {pob.overstayers.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">Overstayers (past planned return)</p>
            <ul className="mt-1 text-amber-800">
              {pob.overstayers.map((o, i) => (
                <li key={i}>
                  {o.name} — {o.installation ?? "?"} · due {o.demob_date}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Accommodation
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rooms" value={accommodation.totalRooms} />
          <Stat label="Beds (usable)" value={accommodation.totalBeds} />
          <Stat label="Occupied" value={accommodation.occupiedBeds} />
          <Stat label="Available" value={accommodation.availableBeds} />
          <Stat label="Fixed (staff)" value={accommodation.fixedBeds} />
          <Stat label="Blocked rooms" value={accommodation.blockedRooms} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Certification alerts
        </h3>
        {certAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">All certifications valid for the next 30 days.</p>
        ) : (
          <div className="space-y-1">
            {certAlerts.map((a, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm",
                  a.expired ? "border-destructive/30 bg-destructive/5" : "bg-card",
                )}
              >
                <span>
                  {a.full_name} · <span className="uppercase">{a.kind}</span>
                </span>
                <span className={cn(a.expired ? "font-medium text-destructive" : "text-amber-700")}>
                  {a.expired ? "Expired" : "Expires"} {a.expiry}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function useRun() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  };
  return { pending, error, run };
}

function CrewsPanel({ crews, installations }: { crews: Crew[]; installations: Installation[] }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [rotation, setRotation] = useState("14/14");
  const [transport, setTransport] = useState("");
  const [departure, setDeparture] = useState("");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {crews.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.name}</span>
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
            <p className="mt-1 text-xs text-muted-foreground">{c.member_count} member(s)</p>
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
              }),
            () => {
              setName("");
              setTransport("");
              setDeparture("");
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
        <Button type="submit" disabled={pending}>Add crew</Button>
      </form>
    </div>
  );
}

function RoomsPanel({ rooms, installations }: { rooms: Room[]; installations: Installation[] }) {
  const { pending, error, run } = useRun();
  const [installationId, setInstallationId] = useState("");
  const [block, setBlock] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [beds, setBeds] = useState("2");
  const [gender, setGender] = useState<GenderRestriction>("any");

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Room</th>
              <th className="px-3 py-2 font-medium">Installation</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Beds</th>
              <th className="px-3 py-2 font-medium">Gender</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rooms.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">
                  {[r.block, r.room_number].filter(Boolean).join(" ")}
                  {r.special_flag && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">{r.special_flag}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.installation_name}</td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{r.room_type}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.bed_count}
                  {r.fixed_assigned > 0 ? ` · ${r.fixed_assigned} fixed` : ""}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{GENDER_LABEL[r.gender_restriction]}</td>
                <td className="px-3 py-2">
                  <select
                    value={r.status}
                    disabled={pending}
                    onChange={(e) => run(() => setRoomStatus(r.id, e.target.value))}
                    className="rounded-md border bg-background px-1.5 py-1 text-xs"
                  >
                    {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                      <option key={s} value={s}>{ROOM_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No rooms yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        className="grid gap-2 rounded-lg border border-dashed bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              upsertRoom({
                installationId,
                block,
                roomNumber,
                roomType,
                bedCount: Number(beds),
                maxBedCount: Number(beds),
                genderRestriction: gender,
              }),
            () => {
              setRoomNumber("");
              setBlock("");
            },
          );
        }}
      >
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} required className={field}>
          <option value="">Installation…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Block (optional)" className={field} />
        <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Room no. (A-203)" required className={field} />
        <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className={`${field} capitalize`}>
          {["single", "double", "shared", "vip", "medic"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input value={beds} onChange={(e) => setBeds(e.target.value)} type="number" min={0} placeholder="Beds" className={field} />
        <select value={gender} onChange={(e) => setGender(e.target.value as GenderRestriction)} className={field}>
          {(Object.keys(GENDER_LABEL) as GenderRestriction[]).map((g) => (
            <option key={g} value={g}>{GENDER_LABEL[g]}</option>
          ))}
        </select>
        <Button type="submit" disabled={pending}>Add room</Button>
      </form>
    </div>
  );
}

function RosterPanel({
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

  function expired(date: string | null) {
    return date ? new Date(date) < new Date() : false;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-card/50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addRosterMember(newId), () => setNewId(""));
        }}
      >
        <span className="text-sm font-medium">Add to roster:</span>
        <select value={newId} onChange={(e) => setNewId(e.target.value)} required className={field}>
          <option value="">Choose person…</option>
          {addable.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending || !newId}>Add</Button>
      </form>

      <div className="space-y-3">
        {roster.map((m) => (
          <div key={m.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.full_name || m.email}</span>
              {!m.travel_eligible && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                  Not eligible
                </span>
              )}
              {m.crew_name && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {m.crew_name}
                </span>
              )}
              {m.fixed_room_label && (
                <span className="text-xs text-muted-foreground">
                  Room {m.fixed_room_label}
                  {m.fixed_bed ? ` · ${m.fixed_bed}` : ""}
                </span>
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
              <select
                value={m.fixed_room_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => updateRosterMember({ id: m.id, fixedRoomId: e.target.value || null }))}
                className={field}
              >
                <option value="">Fixed room…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.block, r.room_number].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
              <input
                defaultValue={m.fixed_bed ?? ""}
                disabled={pending}
                placeholder="Fixed bed (Bed 1)"
                onBlur={(e) => {
                  if (e.target.value !== (m.fixed_bed ?? "")) run(() => updateRosterMember({ id: m.id, fixedBed: e.target.value }));
                }}
                className={field}
              />
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
