"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import type { RosterEntry } from "@/types/offshore";
import { registerNonRotationalStaff } from "../actions";

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
  readOnly = false,
}: {
  roster: RosterEntry[];
  addable: { id: string; full_name: string }[];
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

  const nonRotators = useMemo(
    () =>
      roster
        .filter((m) => !m.is_rotational)
        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")),
    [roster],
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

      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2 text-sm font-semibold">
          Non-rotational staff ({nonRotators.length})
        </div>
        {nonRotators.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            Nobody registered as non-rotational yet.
          </p>
        ) : (
          <ul className="divide-y">
            {nonRotators.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium">{m.full_name || m.email}</span>
                {m.company && <span className="text-xs text-muted-foreground">{m.company}</span>}
                {m.position && <span className="text-xs text-muted-foreground">· {m.position}</span>}
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Non-rotational
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
