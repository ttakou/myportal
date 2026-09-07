"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { bedCandidates } from "@/lib/offshore/bed-candidates";
import { bedKey, duplicateBedKeys, roomBedIssues } from "@/lib/offshore/bed-issues";
import { roomLabel, sortRooms } from "@/lib/offshore/room-order";
import { offshorePeople } from "@/lib/offshore/people";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import type { Installation } from "@/types/offshore";
import {
  GENDER_LABEL,
  ROOM_STATUS_LABEL,
  type AssignableEmployee,
  type GenderRestriction,
  type PobOnboard,
  type Room,
  type RoomStatus,
  type RosterEntry,
} from "@/types/offshore";
import { setRoomStatus, updateRoomFields, updateRosterMember, upsertRoom } from "../../actions";
import { BulkRoomImport } from "../bulk-room-import";
import { OccupantRow, OwnerRow, EmptyBed } from "./bed-cells";
import { field, rosterInfo, useRun } from "./shared";

/**
 * Accommodation: rooms, their status and who is in each bed.
 *
 * Split out of the offshore management component so this view loads
 * only its own code.
 */

/**
 * Live occupancy: every room with its checked-in occupants and a fill level.
 *
 * Editable in place (managers only — the Dispatcher is read-only on Rooms):
 * occupants come from the live trip (room + bed), cabin owners from the roster's
 * fixed cabin, so each half saves through its own action.
 */
function RoomOccupancyList({
  rooms,
  roster,
  employees,
  onboard,
  readOnly = false,
}: {
  rooms: Room[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  onboard: PobOnboard[];
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const { pending, error, run } = useRun();
  const occupiedRooms = rooms.filter((r) => r.occupied > 0).length;
  const totalOnboard = rooms.reduce((n, r) => n + r.occupied, 0);
  // Bed conflicts — two people on one bunk, a room over its berth count,
  // anyone on board here with no bed. The estate mixes positional labels,
  // the facility's own bunk numbers and bottom/top, all of which are valid,
  // so nothing is rewritten; the clashes are just made visible.
  const issuesByRoom = useMemo(() => {
    const m = new Map<string, ReturnType<typeof roomBedIssues>>();
    for (const r of rooms) {
      const found = roomBedIssues(r);
      if (found.length) m.set(r.id, found);
    }
    return m;
  }, [rooms]);
  const roomsWithIssues = issuesByRoom.size;

  // Roster row id per profile — owners carry a profile_id, but the roster action
  // keys off offshore_staff.id.
  const staffByProfile = useMemo(() => {
    const m = new Map<string, RosterEntry>();
    for (const s of roster) m.set(s.profile_id, s);
    return m;
  }, [roster]);

  const onboardProfileIds = useMemo(
    () => new Set(onboard.map((p) => p.profile_id).filter(Boolean) as string[]),
    [onboard],
  );

  // Roster members not on board. Allocating one of them a berth boards them in
  // the same step — see bedCandidates.
  const ashorePool = useMemo(() => {
    const aboard = new Set(onboard.map((p) => p.profile_id).filter(Boolean) as string[]);
    return offshorePeople(employees, rosterInfo(roster))
      .filter((m) => !aboard.has(m.profile_id))
      .map((m) => ({ profile_id: m.profile_id, name: m.name, crew_name: m.crew_name }));
  }, [employees, roster, onboard]);

  // Everyone on board, for the "put someone in this bed" picker.
  const pool = useMemo(
    () =>
      onboard.map((p) => ({
        id: p.trip_id,
        room_id: p.room_id,
        name: p.company ? `${p.name} · ${p.company}` : p.name,
        placedIn: p.room_id ? p.room_label : null,
        bed: p.bed_no,
      })),
    [onboard],
  );
  // Straight A→Z (numeric-aware, so Door 3 precedes Door 10) — a corridor order
  // you can scan, rather than one that reshuffles as people board.
  const allSorted = useMemo(() => sortRooms(rooms), [rooms]);
  // Picking a room narrows the grid to it, for editing one room without
  // hunting through the whole estate.
  const [pickedRoom, setPickedRoom] = useState<string | null>(null);
  const sorted = useMemo(
    () => (pickedRoom ? allSorted.filter((r) => r.id === pickedRoom) : allSorted),
    [allSorted, pickedRoom],
  );

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <span className="text-sm font-semibold">
          Room occupancy (live) — {occupiedRooms} room(s) in use · {totalOnboard} on board
          {roomsWithIssues > 0 && (
            <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              {roomsWithIssues} room(s) need attention
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {error && (
            <p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          {!readOnly && (
            <p className="mb-2 text-xs text-muted-foreground">
              Edit in place: change a bed label, remove someone from a bed, or seat a waiting person.
              Allocating a berth to someone who is ashore also boards them, so they appear on POB and
              the muster roll. Cabin owner(s) set the roster&apos;s fixed cabin — the permanent
              allocation auto-allocate honours first.
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Go to room
              <SearchSelect
                value={pickedRoom}
                options={allSorted}
                getOptionValue={(r) => r.id}
                getOptionLabel={(r) =>
                  `${roomLabel(r)}${r.installation_name ? ` · ${r.installation_name}` : ""} — ${r.occupied}/${r.bed_count || 0}`
                }
                placeholder="All rooms — type to find one…"
                wrapperClassName="mt-0.5 w-64"
                className={cn(field, "w-full py-1")}
                onChange={setPickedRoom}
              />
            </label>
            {pickedRoom && (
              <Button size="sm" variant="outline" onClick={() => setPickedRoom(null)}>
                Show all {allSorted.length} rooms
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((r) => {
              const label = roomLabel(r);
              const beds = r.bed_count || 0;
              const over = r.occupied > beds;
              const pct = beds > 0 ? Math.min(100, (r.occupied / beds) * 100) : r.occupied > 0 ? 100 : 0;
              // A blocked / under-maintenance room keeps its occupants (and the
              // controls to move them out) but takes nobody new.
              const takesPeople = !["blocked", "maintenance"].includes(r.status);
              const free = takesPeople ? Math.max(0, beds - r.occupants.length) : 0;
              // Suggested labels for the empty beds: lowest "Bed N" not in use.
              const usedBeds = new Set(r.occupants.map((o) => o.bed_no).filter(Boolean) as string[]);
              const slotLabels: string[] = [];
              let k = 0;
              while (slotLabels.length < free) {
                k++;
                const lbl = `Bed ${k}`;
                if (!usedBeds.has(lbl)) slotLabels.push(lbl);
              }
              const candidates = bedCandidates(pool, r.id, ashorePool, !readOnly);
              const ownerIds = new Set(r.owners.map((o) => o.profile_id));
              const roomIssues = issuesByRoom.get(r.id) ?? [];
              // A bed belongs to a live trip, so an owner who is ashore has
              // nothing to attach one to — they are not in the picker, and
              // without saying so their absence reads as a bug.
              const ashoreOwners = r.owners.filter((o) => !onboardProfileIds.has(o.profile_id));
              const dupBeds = duplicateBedKeys(r);
              const ownerCandidates = roster
                .filter((s) => !ownerIds.has(s.profile_id))
                .map((s) => ({
                  id: s.id,
                  label: s.fixed_room_id
                    ? `${s.full_name || s.email} — move from ${s.fixed_room_label ?? "a cabin"}`
                    : s.full_name || s.email,
                }));
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-md border p-2 text-sm",
                    // Empty rooms recede only when there's nothing to do with
                    // them — with the editors on they are a place to seat people.
                    readOnly && r.occupied === 0 && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{label}</span>
                    <span className={cn("text-xs font-semibold", over ? "text-destructive" : r.occupied === 0 ? "text-muted-foreground" : "text-green-700")}>
                      {r.occupied}/{beds}
                      {over ? " · hot-bunk" : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full", over ? "bg-destructive" : "bg-green-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {roomIssues.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 rounded border border-destructive/30 bg-destructive/5 px-1.5 py-1">
                      {roomIssues.map((iss, n) => (
                        <li key={n} className="flex items-start gap-1 text-[11px] text-destructive">
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                          {iss.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(r.occupants.length > 0 || (!readOnly && slotLabels.length > 0)) && (
                    <ul className="mt-1.5 space-y-1">
                      {r.occupants.map((o) =>
                        readOnly || o.kind === "visitor" ? (
                          <li key={o.trip_id} className="flex items-center gap-1.5 text-xs">
                            <span
                              className={cn(
                                "font-mono",
                                o.bed_no && dupBeds.has(bedKey(o.bed_no))
                                  ? "font-semibold text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {o.bed_no || "•"}
                            </span>
                            <span className="font-medium">{o.name}</span>
                            {o.kind === "visitor" && (
                              <span
                                className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                                title="Holds this bed through a visit booking — change it on the Visitors tab"
                              >
                                visitor
                              </span>
                            )}
                          </li>
                        ) : (
                          <OccupantRow
                            key={o.trip_id}
                            occupant={o}
                            roomId={r.id}
                            clashes={Boolean(o.bed_no) && dupBeds.has(bedKey(o.bed_no ?? ""))}
                            pending={pending}
                            run={run}
                          />
                        ),
                      )}
                      {!readOnly &&
                        slotLabels.map((lbl) => (
                          <EmptyBed
                            key={`${r.id}-${lbl}`}
                            roomId={r.id}
                            defaultBed={lbl}
                            candidates={candidates}
                            pending={pending}
                            run={run}
                          />
                        ))}
                    </ul>
                  )}
                  {!readOnly && ashoreOwners.length > 0 && (
                    <p className="mt-1.5 rounded border border-dashed bg-muted/30 px-1.5 py-1 text-[11px] text-muted-foreground">
                      {ashoreOwners.length} cabin owner(s) are ashore. Picking one in a bed above
                      boards them into it — they join POB and the muster roll straight away. Their
                      permanent berth is editable below without boarding them.
                    </p>
                  )}
                  {(r.owners.length > 0 || !readOnly) && (
                    <div className="mt-1.5 border-t pt-1 text-[11px] text-muted-foreground">
                      <span className="font-medium">Cabin owner(s)</span>
                      <ul className="mt-0.5 space-y-0.5">
                        {r.owners.map((o) =>
                          readOnly ? (
                            <li key={o.profile_id} className="flex items-center gap-1">
                              <span className="font-mono">{o.bed || "•"}</span>
                              <span>{o.name}</span>
                              {!onboardProfileIds.has(o.profile_id) && (
                                <span className="text-muted-foreground/70">· ashore</span>
                              )}
                              {o.back_to_back ? <span className="text-muted-foreground/70"> ⇄ {o.back_to_back}</span> : ""}
                            </li>
                          ) : (
                            <OwnerRow
                              key={o.profile_id}
                              owner={o}
                              staffId={staffByProfile.get(o.profile_id)?.id ?? null}
                              aboard={onboardProfileIds.has(o.profile_id)}
                              pending={pending}
                              run={run}
                            />
                          ),
                        )}
                      </ul>
                      {!readOnly && (
                        <SearchSelect
                          value={null}
                          options={ownerCandidates}
                          getOptionValue={(s) => s.id}
                          getOptionLabel={(s) => s.label}
                          placeholder={ownerCandidates.length ? "Type a name to add owner…" : "— no one left —"}
                          disabled={pending || ownerCandidates.length === 0}
                          wrapperClassName="mt-1"
                          className="w-full rounded border bg-background px-1 py-0.5 text-[11px]"
                          onChange={(v) => v && run(() => updateRosterMember({ id: v, fixedRoomId: r.id }))}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {rooms.length === 0 && <p className="text-sm text-muted-foreground">No rooms yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function RoomsPanel({
  rooms,
  installations,
  roster,
  employees,
  onboard,
  readOnly = false,
}: {
  rooms: Room[];
  installations: Installation[];
  roster: RosterEntry[];
  employees: AssignableEmployee[];
  onboard: PobOnboard[];
  readOnly?: boolean;
}) {
  const { pending, error, run } = useRun();
  const [installationId, setInstallationId] = useState("");
  const [block, setBlock] = useState("");
  const [floor, setFloor] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("shared");
  const [beds, setBeds] = useState("2");
  const [gender, setGender] = useState<GenderRestriction>("any");
  const [repDate, setRepDate] = useState(() => new Date().toISOString().slice(0, 10));
  const roomsReveal = useProgressiveReveal(rooms.length);

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-card/50 p-2">
        <span className="text-sm font-medium">PDF report:</span>
        <label className="text-xs text-muted-foreground">
          As of
          <input type="date" value={repDate} onChange={(e) => setRepDate(e.target.value)} className={cn(field, "mt-0.5 block py-1")} />
        </label>
        <Button size="sm" variant="outline" disabled={!repDate} onClick={() => window.open(`/offshore-rooms?date=${repDate}`, "_blank")}>
          <FileText className="h-4 w-4" /> Room allocation report
        </Button>
      </div>
      <RoomOccupancyList
        rooms={rooms}
        roster={roster}
        employees={employees}
        onboard={onboard}
        readOnly={readOnly}
      />
      {!readOnly && (
        <>
      <BulkRoomImport />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Room</th>
              <th className="px-3 py-2 font-medium">Installation</th>
              <th className="px-3 py-2 font-medium">Floor</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Beds</th>
              <th className="px-3 py-2 font-medium">Muster</th>
              <th className="px-3 py-2 font-medium">Gender</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rooms.slice(0, roomsReveal.count).map((r) => {
              const cell = "w-full rounded-md border bg-background px-2 py-1 text-xs";
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={r.block ?? ""}
                        disabled={pending}
                        placeholder="Block"
                        onBlur={(e) => {
                          if (e.target.value !== (r.block ?? "")) run(() => updateRoomFields({ id: r.id, block: e.target.value }));
                        }}
                        className={`${cell} w-16`}
                      />
                      <input
                        defaultValue={r.room_number}
                        disabled={pending}
                        onBlur={(e) => {
                          if (e.target.value !== r.room_number) run(() => updateRoomFields({ id: r.id, roomNumber: e.target.value }));
                        }}
                        className={`${cell} w-24 font-medium`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.installation_name}</td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.floor ?? ""}
                      disabled={pending}
                      placeholder="—"
                      onBlur={(e) => {
                        if (e.target.value !== (r.floor ?? "")) run(() => updateRoomFields({ id: r.id, floor: e.target.value }));
                      }}
                      className={cell}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.room_type}
                      disabled={pending}
                      onChange={(e) => run(() => updateRoomFields({ id: r.id, roomType: e.target.value }))}
                      className={`${cell} capitalize`}
                    >
                      {["single", "double", "shared", "vip", "medic"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        defaultValue={r.bed_count}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== r.bed_count) run(() => updateRoomFields({ id: r.id, bedCount: v }));
                        }}
                        className={`${cell} w-16`}
                      />
                      {r.fixed_assigned > 0 && (
                        <span className="text-[10px] text-muted-foreground">{r.fixed_assigned} fixed</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={r.lifeboat ?? ""}
                      disabled={pending}
                      placeholder="LB-1"
                      onBlur={(e) => {
                        if (e.target.value !== (r.lifeboat ?? "")) run(() => updateRoomFields({ id: r.id, lifeboat: e.target.value }));
                      }}
                      className={`${cell} w-20`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.gender_restriction}
                      disabled={pending}
                      onChange={(e) => run(() => updateRoomFields({ id: r.id, genderRestriction: e.target.value }))}
                      className={cell}
                    >
                      {(Object.keys(GENDER_LABEL) as GenderRestriction[]).map((g) => (
                        <option key={g} value={g}>{GENDER_LABEL[g]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      disabled={pending}
                      onChange={(e) => run(() => setRoomStatus(r.id, e.target.value))}
                      className={cell}
                    >
                      {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                        <option key={s} value={s}>{ROOM_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {rooms.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No rooms yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMore
        ref={roomsReveal.sentinelRef}
        hasMore={roomsReveal.hasMore}
        remaining={roomsReveal.remaining}
        onClick={roomsReveal.showMore}
        label="Show more rooms"
      />

      <form
        className="grid gap-2 rounded-lg border border-dashed bg-card/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              upsertRoom({
                installationId,
                block,
                floor,
                roomNumber,
                roomType,
                bedCount: Number(beds),
                maxBedCount: Number(beds),
                genderRestriction: gender,
              }),
            () => {
              setRoomNumber("");
              setBlock("");
              setFloor("");
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
        <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Floor / location" className={field} />
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
        </>
      )}
    </div>
  );
}
