"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { UserCheck, UserX, AlertTriangle, ChevronDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";
import type { PendingUser, TenantUser } from "@/lib/admin";
import type { AccessRole } from "@/lib/access-roles";
import { assignPendingUser, dismissPendingUser } from "../actions";

const ROLES: UserRole[] = ["employee", "manager", "tenant_admin"];
const ROLE_LABEL: Record<UserRole, string> = {
  employee: "Employee",
  manager: "Manager",
  tenant_admin: "Admin",
  super_admin: "Super admin",
};

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Review queue for tenant-less sign-ups (a fresh sign-up or SSO first login).
 * HR can adopt each into the organisation (set role, manager, access) or
 * dismiss it. Renders nothing when the queue is empty.
 */
export function PendingUsersPanel({
  pending,
  users,
  accessRoles,
}: {
  pending: PendingUser[];
  users: TenantUser[];
  accessRoles: AccessRole[];
}) {
  const managers = useMemo(() => users.filter((u) => u.is_active), [users]);
  // Flag a pending sign-up whose email already belongs to an active member —
  // usually a duplicate account that should be merged/dismissed, not adopted.
  const dupByEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) {
      if (u.is_active && u.email) m.set(u.email.toLowerCase(), u.full_name || u.email);
    }
    return m;
  }, [users]);

  if (pending.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Pending access</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {pending.length}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        People who signed in but aren&apos;t linked to your organisation yet. Adopt them to grant
        access, or dismiss the ones that shouldn&apos;t be here.
      </p>
      <div className="divide-y rounded-lg border">
        {pending.map((u) => (
          <PendingRow
            key={u.id}
            user={u}
            managers={managers}
            accessRoles={accessRoles}
            duplicateOf={u.email ? dupByEmail.get(u.email.toLowerCase()) ?? null : null}
          />
        ))}
      </div>
    </section>
  );
}

function PendingRow({
  user,
  managers,
  accessRoles,
  duplicateOf,
}: {
  user: PendingUser;
  managers: TenantUser[];
  accessRoles: AccessRole[];
  duplicateOf: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<UserRole>("employee");
  const [managerId, setManagerId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [pending, start] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function toggleRole(id: string) {
    setRoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function assign() {
    setError(null);
    start(async () => {
      const res = await assignPendingUser({
        userId: user.id,
        role,
        managerId: managerId || undefined,
        accessRoleIds: roleIds,
      });
      if (!res.ok) setError(res.error ?? "Could not grant access.");
    });
  }

  function dismiss() {
    if (!window.confirm("Dismiss this sign-up? Their account will be deactivated.")) return;
    setError(null);
    start(async () => {
      const res = await dismissPendingUser(user.id);
      if (!res.ok) setError(res.error ?? "Could not dismiss.");
    });
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{user.full_name || user.email || "Unknown"}</span>
            {user.access_requested_at && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                Requested access
              </span>
            )}
            {duplicateOf && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" /> Possible duplicate of {duplicateOf}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {user.email || "no email"} · signed up {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant={open ? "default" : "outline"} onClick={() => setOpen((o) => !o)}>
            <UserCheck className="h-3.5 w-3.5" /> Adopt
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </Button>
          <Button size="sm" variant="outline" onClick={dismiss} disabled={pending}>
            <UserX className="h-3.5 w-3.5" /> Dismiss
          </Button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {open && (
        <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Account role</span>
              <select
                className={cn(field, "w-full")}
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Manager (optional)</span>
              <select
                className={cn(field, "w-full")}
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                <option value="">— none —</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {accessRoles.length > 0 && (
            <div className="space-y-1 text-sm">
              <span className="text-muted-foreground">Access roles (optional)</span>
              <div className="flex flex-wrap gap-1.5">
                {accessRoles.map((r) => {
                  const on = roleIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRole(r.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={assign} disabled={pending}>
              <UserCheck className="h-3.5 w-3.5" /> Grant access
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
