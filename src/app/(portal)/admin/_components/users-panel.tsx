"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";
import type { TenantUser } from "@/lib/admin";
import { setUserActive, setUserManager, setUserRole } from "../actions";

const ROLES: UserRole[] = ["employee", "manager", "tenant_admin"];

export function UsersPanel({ users }: { users: TenantUser[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Update failed.");
    });
  }

  // Managers are users with role manager or tenant_admin.
  const managerOptions = users.filter(
    (u) => u.role === "manager" || u.role === "tenant_admin",
  );

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
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Manager</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className={cn(!u.is_active && "opacity-60")}>
                <td className="px-4 py-3">
                  <div className="font-medium">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
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
                  <select
                    value={u.manager_id ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      run(() => setUserManager(u.id, e.target.value || null))
                    }
                    className="rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-50"
                  >
                    <option value="">— none —</option>
                    {managerOptions
                      .filter((m) => m.id !== u.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name || m.email}
                        </option>
                      ))}
                  </select>
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
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
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
