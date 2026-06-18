"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useStatusTransition } from "@/components/activity";
import { Check, Copy, KeyRound, SlidersHorizontal, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";
import type { FunctionalRole } from "@/lib/auth";
import type { EmployeeType, TenantUser } from "@/lib/admin";
import type { AccessRole } from "@/lib/access-roles";
import {
  addUserRole,
  removeUserRole,
  setUserAccessRole,
  setUserActive,
  setUserDepartment,
  setUserLunchEligible,
  setUserFullName,
  setUserJobTitle,
  setUserManager,
  setUserPassword,
  setUserRole,
  setUserType,
  updateUserEmail,
  startImpersonation,
} from "../actions";

const ROLES: UserRole[] = ["employee", "manager", "tenant_admin"];
const TYPES: EmployeeType[] = ["employee", "contractor", "guest"];
const FUNCTIONAL: { role: FunctionalRole; label: string }[] = [
  { role: "canteen_staff", label: "Canteen staff" },
  { role: "canteen_manager", label: "Canteen mgr" },
  { role: "hr_admin", label: "HR" },
  { role: "finance", label: "Finance" },
  { role: "safety_admin", label: "Safety" },
  { role: "oim", label: "OIM" },
  { role: "system_admin", label: "Sys admin" },
];

/**
 * Manager picker that defers rendering its options until the dropdown is first
 * focused. Rendering every active user as an <option> for every row is
 * O(users²) — with a few hundred staff that produced hundreds of thousands of
 * DOM nodes and made the admin page take minutes to load/hydrate. Until focus
 * we render only the currently-selected option, so the value still displays.
 */
function ManagerSelect({
  value,
  options,
  excludeId,
  disabled,
  className,
  onChange,
}: {
  value: string | null;
  options: TenantUser[];
  excludeId: string;
  disabled: boolean;
  className: string;
  onChange: (managerId: string | null) => void;
}) {
  const [ready, setReady] = useState(false);
  const selected = options.find((m) => m.id === value);
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onFocus={() => setReady(true)}
      onChange={(e) => onChange(e.target.value || null)}
      className={className}
    >
      <option value="">— none —</option>
      {ready
        ? options
            .filter((m) => m.id !== excludeId)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))
        : selected &&
          selected.id !== excludeId && (
            <option value={selected.id}>{selected.full_name || selected.email}</option>
          )}
    </select>
  );
}

export function UsersPanel({
  users,
  canAssignRoles,
  accessRoles = [],
  canImpersonate = false,
  selfId = "",
}: {
  users: TenantUser[];
  canAssignRoles: boolean;
  accessRoles?: AccessRole[];
  canImpersonate?: boolean;
  selfId?: string;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Update failed.");
    });
  }

  // Any active staff member can be selected as a manager.
  const managerOptions = users.filter((u) => u.is_active);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">People</h2>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Manager</th>
              <th className="px-4 py-3 font-medium">Lunch</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canAssignRoles && <th className="px-4 py-3 font-medium">Roles &amp; access</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <Fragment key={u.id}>
              <tr className={cn(!u.is_active && "opacity-60")}>
                <td className="px-4 py-3">
                  {canAssignRoles ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                      className="text-left font-medium hover:underline"
                      title="View full profile & assign roles"
                    >
                      {u.full_name || "—"}
                    </button>
                  ) : (
                    <div className="font-medium">{u.full_name || "—"}</div>
                  )}
                  {u.email ? (
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  ) : canAssignRoles ? (
                    <EmailCell userId={u.id} />
                  ) : (
                    <div className="text-xs text-muted-foreground italic">email pending</div>
                  )}
                  {(u.functional_roles.length > 0 || u.access_role_ids.length > 0) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {u.functional_roles.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {FUNCTIONAL.find((f) => f.role === r)?.label ?? r}
                        </span>
                      ))}
                      {accessRoles
                        .filter((r) => u.access_role_ids.includes(r.id))
                        .map((r) => (
                          <span
                            key={r.id}
                            className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700"
                          >
                            {r.name}
                          </span>
                        ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.department ?? ""}
                    disabled={pending}
                    placeholder="—"
                    onBlur={(e) => { if (e.target.value !== (u.department ?? "")) run(() => setUserDepartment(u.id, e.target.value)); }}
                    className="w-28 rounded-md border bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.employee_type}
                    disabled={pending}
                    onChange={(e) => run(() => setUserType(u.id, e.target.value as EmployeeType))}
                    className="rounded-md border bg-background px-2 py-1 text-sm capitalize"
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={pending || u.role === "super_admin"}
                    onChange={(e) =>
                      run(() => setUserRole(u.id, e.target.value as UserRole))
                    }
                    className="rounded-md border bg-background px-2 py-1 text-sm capitalize disabled:opacity-50"
                  >
                    {u.role === "super_admin" && (
                      <option value="super_admin">super admin</option>
                    )}
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <ManagerSelect
                    value={u.manager_id ?? null}
                    options={managerOptions}
                    excludeId={u.id}
                    disabled={pending}
                    className="rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-50"
                    onChange={(mid) => run(() => setUserManager(u.id, mid))}
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setUserLunchEligible(u.id, !u.lunch_eligible))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      u.lunch_eligible
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {u.lunch_eligible ? "Eligible" : "Not eligible"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setUserActive(u.id, !u.is_active))}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      u.is_active
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </button>
                  {canImpersonate && u.id !== selfId && (
                    <button
                      type="button"
                      disabled={pending}
                      title="Act as this user"
                      onClick={() =>
                        startTransition(async () => {
                          const res = await startImpersonation(u.id);
                          if (!res.ok) setError(res.error ?? "Could not impersonate.");
                          else window.location.href = "/dashboard";
                        })
                      }
                      className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
                    >
                      <UserCog className="h-3.5 w-3.5" /> Impersonate
                    </button>
                  )}
                </td>
                {canAssignRoles && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent",
                        expanded === u.id && "bg-accent",
                      )}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Roles &amp; access
                    </button>
                  </td>
                )}
              </tr>
              {canAssignRoles && expanded === u.id && (
                <tr className="bg-muted/30">
                  <td colSpan={8} className="px-4 py-4">
                    <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Profile details
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Full name">
                          <InlineText
                            value={u.full_name ?? ""}
                            placeholder="Full name"
                            pending={pending}
                            onSave={(v) => run(() => setUserFullName(u.id, v))}
                          />
                        </Field>
                        <Field label="Job title">
                          <InlineText
                            value={u.job_title ?? ""}
                            placeholder="Job title"
                            pending={pending}
                            onSave={(v) => run(() => setUserJobTitle(u.id, v))}
                          />
                        </Field>
                        <Field label="Email">
                          <InlineText
                            value={u.email ?? ""}
                            placeholder="email@company.com"
                            pending={pending}
                            onSave={(v) => run(() => updateUserEmail(u.id, v))}
                          />
                        </Field>
                        <Field label="Department">
                          <InlineText
                            value={u.department ?? ""}
                            placeholder="Department"
                            pending={pending}
                            onSave={(v) => run(() => setUserDepartment(u.id, v))}
                          />
                        </Field>
                        <Field label="Type">
                          <select
                            value={u.employee_type}
                            disabled={pending}
                            onChange={(e) => run(() => setUserType(u.id, e.target.value as EmployeeType))}
                            className="w-full rounded-md border bg-background px-2 py-1 text-sm capitalize"
                          >
                            {TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Account role">
                          <select
                            value={u.role}
                            disabled={pending || u.role === "super_admin"}
                            onChange={(e) => run(() => setUserRole(u.id, e.target.value as UserRole))}
                            className="w-full rounded-md border bg-background px-2 py-1 text-sm capitalize disabled:opacity-50"
                          >
                            {u.role === "super_admin" && (
                              <option value="super_admin">super admin</option>
                            )}
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Manager">
                          <ManagerSelect
                            value={u.manager_id ?? null}
                            options={managerOptions}
                            excludeId={u.id}
                            disabled={pending}
                            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                            onChange={(mid) => run(() => setUserManager(u.id, mid))}
                          />
                        </Field>
                        <Field label="Lunch">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => setUserLunchEligible(u.id, !u.lunch_eligible))}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              u.lunch_eligible
                                ? "bg-green-100 text-green-700"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {u.lunch_eligible ? "Eligible" : "Not eligible"}
                          </button>
                        </Field>
                        <Field label="Status">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => setUserActive(u.id, !u.is_active))}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              u.is_active
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {u.is_active ? "Active" : "Inactive"}
                          </button>
                        </Field>
                      </div>
                    </div>
                    <div className="grid gap-5 md:grid-cols-3">
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Functional roles (capabilities)
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {FUNCTIONAL.map((fr) => {
                            const on = u.functional_roles.includes(fr.role);
                            return (
                              <button
                                key={fr.role}
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    on ? removeUserRole(u.id, fr.role) : addUserRole(u.id, fr.role),
                                  )
                                }
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  on ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-accent",
                                )}
                              >
                                {fr.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {accessRoles.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Module access
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {accessRoles.map((r) => {
                              const on = u.access_role_ids.includes(r.id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  disabled={pending}
                                  title={
                                    r.description ||
                                    (r.module_slugs.length
                                      ? `Grants: ${r.module_slugs.join(", ")}`
                                      : "Grants no modules")
                                  }
                                  onClick={() => run(() => setUserAccessRole(u.id, r.id, !on))}
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    on
                                      ? "bg-green-600 text-white"
                                      : "border text-muted-foreground hover:bg-accent",
                                  )}
                                >
                                  {r.name}
                                </button>
                              );
                            })}
                            {u.access_role_ids.length === 0 && (
                              <span className="text-[11px] text-muted-foreground">no module access yet</span>
                            )}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Password
                        </p>
                        <SetPasswordControl userId={u.id} />
                      </div>
                    </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A labelled read/edit field in the profile detail grid. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

/** Text input that saves on blur when the value changed. */
function InlineText({
  value,
  onSave,
  pending,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  pending: boolean;
  placeholder?: string;
}) {
  return (
    <input
      defaultValue={value}
      disabled={pending}
      placeholder={placeholder}
      onBlur={(e) => {
        if (e.target.value !== value) onSave(e.target.value);
      }}
      className="w-full rounded-md border bg-background px-2 py-1 text-sm"
    />
  );
}

/** Inline "add email" for accounts created without one. */
function EmailCell({ userId }: { userId: string }) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-0.5 flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await updateUserEmail(userId, value);
          if (!res.ok) setError(res.error ?? "Failed.");
        });
      }}
    >
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="add email…"
        className="w-44 rounded-md border bg-background px-2 py-0.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending || !value.trim()}
        className="rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50"
      >
        Save
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </form>
  );
}

/** Inline control to set a chosen password or generate a temporary one. */
function SetPasswordControl({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  function save(generate: boolean) {
    setError(null);
    setGenerated(null);
    setDone(false);
    startTransition(async () => {
      const res = await setUserPassword(userId, generate ? undefined : value);
      if (!res.ok) {
        setError(res.error ?? "Could not set password.");
        return;
      }
      if (res.tempPassword) setGenerated(res.tempPassword);
      else setDone(true);
      setValue("");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
      >
        <KeyRound className="h-3.5 w-3.5" /> Set password
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New password"
          className="w-32 rounded-md border bg-background px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={pending || value.trim().length < 8}
          onClick={() => save(false)}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          Set
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => save(true)}
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Generate
        </button>
      </div>
      {value.trim().length > 0 && value.trim().length < 8 && (
        <p className="text-[11px] text-muted-foreground">Min 8 characters.</p>
      )}
      {generated && (
        <div className="flex items-center gap-1">
          <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{generated}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(generated);
              setCopied(true);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
      {done && <p className="text-[11px] text-green-600">Password updated.</p>}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
