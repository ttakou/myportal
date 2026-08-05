"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import type { PobOnboard, RosterEntry } from "@/types/offshore";
import { boardMember, offboardTrip, registerNonRotationalStaff } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Register someone who works offshore but sits outside the crew rotation — a
 * vendor technician, an inspector, a short-term contractor.
 *
 * One form, two paths: pick somebody already in the system, or type a name to
 * create the account at the same time. Either way they join the offshore roster
 * with no crew, so POB and the muster roll count them as staff (not as a
 * "casual visitor") while the rotation maths leaves them alone.
 */
export function RegisterNonRotational({
  roster,
  addable,
  onboard,
  canBoard = false,
  readOnly = false,
}: {
  roster: RosterEntry[];
  addable: { id: string; full_name: string }[];
  onboard: PobOnboard[];
  /**
   * Boarding needs the offshore `operate` verb, which the registrar roles do
   * not hold — they may register people but not put them on the installation.
   */
  canBoard?: boolean;
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // "existing" picks a profile already in the tenant; "new" creates the account.
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [employeeType, setEmployeeType] = useState<"employee" | "contractor">("contractor");

  // A person with no crew is invisible to the crew-based board controls on the
  // dashboard, so this is the only place they can be put on board.
  const tripByProfile = useMemo(() => {
    const m = new Map<string, PobOnboard>();
    for (const p of onboard) if (p.profile_id) m.set(p.profile_id, p);
    return m;
  }, [onboard]);

  const byName = (a: RosterEntry, b: RosterEntry) =>
    (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email);
  const crewless = useMemo(() => roster.filter((m) => !m.crew_id), [roster]);
  const nonRotators = useMemo(
    () => crewless.filter((m) => !m.is_rotational).sort(byName),
    [crewless],
  );
  const awaitingCrew = useMemo(
    () => crewless.filter((m) => m.is_rotational).sort(byName),
    [crewless],
  );

  function reset() {
    setProfileId(null);
    setFullName("");
    setEmail("");
    setCompany("");
    setPosition("");
  }

  function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await registerNonRotationalStaff(
        mode === "existing"
          ? { profileId: profileId ?? undefined, company, position }
          : { fullName, email, company, position, employeeType },
      );
      if (!res.ok) {
        setError(res.error ?? "Could not register.");
        return;
      }
      setNotice(
        res.tempPassword
          ? `Registered. No email was given, so note the temporary password now — it is not shown again: ${res.tempPassword}`
          : "Registered onto the offshore roster as non-rotational.",
      );
      reset();
    });
  }

  function runBoarding(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  const canSubmit =
    !pending && (mode === "existing" ? Boolean(profileId) : fullName.trim().length > 0);

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}
      {notice && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          {notice}
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        For people who work offshore but are not on a rotation — vendor technicians, inspectors,
        short-term contractors. They join the offshore staff roster with no crew, so POB and the
        muster roll count them as staff while the rotation calendar leaves them out.
        {canBoard &&
          " Anyone on the roster without a crew is listed below and can be boarded here — the" +
            " dashboard's board controls are built per crew, so crewless people never appear there."}
      </p>

      {readOnly ? (
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          You have read-only access to this view.
        </p>
      ) : (
        <div className="space-y-3 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap gap-2">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  mode === m ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
                )}
              >
                {m === "existing" ? "Already in the system" : "New person"}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {mode === "existing" ? (
              <label className="text-xs text-muted-foreground sm:col-span-2">
                Person
                <SearchSelect
                  value={profileId}
                  options={addable}
                  getOptionValue={(p) => p.id}
                  getOptionLabel={(p) => p.full_name}
                  placeholder={
                    addable.length ? "Type a name…" : "— everyone is already on the roster —"
                  }
                  disabled={pending || addable.length === 0}
                  wrapperClassName="mt-0.5"
                  className={cn(field, "w-full")}
                  onChange={setProfileId}
                />
              </label>
            ) : (
              <>
                <label className="text-xs text-muted-foreground">
                  Full name
                  <input
                    value={fullName}
                    disabled={pending}
                    placeholder="Jane Doe"
                    onChange={(e) => setFullName(e.target.value)}
                    className={cn(field, "mt-0.5 block w-full")}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Email (optional)
                  <input
                    value={email}
                    disabled={pending}
                    placeholder="Leave blank if they have none"
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(field, "mt-0.5 block w-full")}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Type
                  <select
                    value={employeeType}
                    disabled={pending}
                    onChange={(e) => setEmployeeType(e.target.value as "employee" | "contractor")}
                    className={cn(field, "mt-0.5 block w-full")}
                  >
                    <option value="contractor">Contractor</option>
                    <option value="employee">Employee</option>
                  </select>
                </label>
              </>
            )}

            <label className="text-xs text-muted-foreground">
              Company (optional)
              <input
                value={company}
                disabled={pending}
                placeholder="APCC, TEFON…"
                onChange={(e) => setCompany(e.target.value)}
                className={cn(field, "mt-0.5 block w-full")}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Position (optional)
              <input
                value={position}
                disabled={pending}
                placeholder="Inspector, technician…"
                onChange={(e) => setPosition(e.target.value)}
                className={cn(field, "mt-0.5 block w-full")}
              />
            </label>
          </div>

          <Button size="sm" disabled={!canSubmit} onClick={submit}>
            <UserPlus className="h-4 w-4" /> Register non-rotational staff
          </Button>
        </div>
      )}

      <CrewlessList
        title="Non-rotational staff"
        empty="Nobody registered as non-rotational yet."
        people={nonRotators}
        badge="Non-rotational"
        tripByProfile={tripByProfile}
        canBoard={canBoard}
        pending={pending}
        onRun={runBoarding}
      />

      {awaitingCrew.length > 0 && (
        <CrewlessList
          title="Rotational staff not yet in a crew"
          empty=""
          note="They have no rotation cycle to board them from, so board them here or assign a crew on Assign crews."
          people={awaitingCrew}
          badge="No crew"
          tripByProfile={tripByProfile}
          canBoard={canBoard}
          pending={pending}
          onRun={runBoarding}
        />
      )}

    </div>
  );
}

/**
 * Roster members with no crew, with the board control they cannot reach
 * anywhere else — the dashboard's "Board now" list is built per crew, so a
 * crewless person never appears in it.
 */
function CrewlessList({
  title,
  empty,
  note,
  people,
  badge,
  tripByProfile,
  canBoard,
  pending,
  onRun,
}: {
  title: string;
  empty: string;
  note?: string;
  people: RosterEntry[];
  badge: string;
  tripByProfile: Map<string, PobOnboard>;
  canBoard: boolean;
  pending: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">
        {title} ({people.length})
      </div>
      {note && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">{note}</p>}
      {people.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {people.map((m) => {
            const trip = tripByProfile.get(m.profile_id);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium">{m.full_name || m.email}</span>
                {m.company && <span className="text-xs text-muted-foreground">{m.company}</span>}
                {m.position && <span className="text-xs text-muted-foreground">· {m.position}</span>}
                <span
                  className={cn(
                    "ml-auto rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                    trip ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground",
                  )}
                >
                  {trip ? `On board${trip.room_label ? ` · ${trip.room_label}` : ""}` : badge}
                </span>
                {canBoard &&
                  (trip ? (
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Demob ${m.full_name || m.email} now?`))
                          onRun(() => offboardTrip(trip.trip_id));
                      }}
                      className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-destructive/10 hover:text-destructive"
                    >
                      Demob
                    </button>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => onRun(() => boardMember(m.profile_id))}
                      className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-green-50 hover:text-green-700"
                    >
                      Board now
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
