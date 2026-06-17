"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AccessRole } from "@/lib/access-roles";
import type { TenantModule, TenantUser } from "@/lib/admin";
import {
  MODULE_CAPABILITIES,
  VERBS,
  VERB_HINT,
  VERB_LABEL,
  type PermissionMap,
  type Verb,
} from "@/lib/permissions";
import {
  createAccessRole,
  deleteAccessRole,
  setUserAccessRole,
  updateAccessRole,
} from "../actions";

/**
 * Access-role editor: pick an existing role from the dropdown to modify, or
 * choose "New role" to create one. Below the role's permission matrix, assign
 * people to the role from the full user list.
 */
export function RolesPanel({
  roles,
  modules,
  users,
}: {
  roles: AccessRole[];
  modules: TenantModule[];
  users: TenantUser[];
}) {
  const assignable = modules.filter((m) => !m.is_core);
  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? "");
  const selected = roles.find((r) => r.id === selectedId) ?? null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Access roles</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Each role decides, per module, what its members can do — see, create,
        edit, approve, operate or manage. A module is hidden unless the role
        grants <b>View</b>.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium">Role</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="min-w-[220px] rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="">➕ New role…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          Select a role to modify, or “New role” to create one.
        </span>
      </div>

      <RoleEditor
        key={selected?.id ?? "new"}
        role={selected}
        assignable={assignable}
        users={users}
        onCreated={(id) => setSelectedId(id)}
        onDeleted={() => setSelectedId("")}
      />
    </section>
  );
}

/** Stable string for dirty-checking a permission map. */
function permsKey(p: PermissionMap): string {
  return Object.keys(p)
    .sort()
    .map((s) => `${s}:${[...p[s]].sort().join("+")}`)
    .join("|");
}

function RoleEditor({
  role,
  assignable,
  users,
  onCreated,
  onDeleted,
}: {
  role: AccessRole | null;
  assignable: TenantModule[];
  users: TenantUser[];
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<PermissionMap>(role?.permissions ?? {});

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: (r: any) => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.(res);
    });
  }

  const dirty =
    name !== (role?.name ?? "") ||
    description !== (role?.description ?? "") ||
    permsKey(perms) !== permsKey(role?.permissions ?? {});

  return (
    <div className="rounded-lg border bg-card p-4">
      {error && (
        <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Role name (e.g. Field staff)"
            className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-sm font-medium"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-xs"
          />
        </div>
        {role && (
          <button
            type="button"
            title="Delete role"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  `Delete the "${role.name}" role? ${role.member_count} member(s) will lose it.`,
                )
              ) {
                run(() => deleteAccessRole(role.id), onDeleted);
              }
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3">
        <PermissionMatrix
          assignable={assignable}
          perms={perms}
          setPerms={setPerms}
          disabled={pending}
        />
      </div>

      <div className="mt-3 flex items-center justify-end">
        {dirty && (
          <Button
            size="sm"
            disabled={pending || !name.trim()}
            onClick={() => {
              if (role) {
                run(() => updateAccessRole({ id: role.id, name, description, permissions: perms }));
              } else {
                run(
                  () => createAccessRole({ name, description, permissions: perms }),
                  (res) => res.id && onCreated(res.id),
                );
              }
            }}
          >
            {role ? "Save changes" : "Create role"}
          </Button>
        )}
      </div>

      {role && (
        <MemberAssigner role={role} users={users} pending={pending} run={run} />
      )}
    </div>
  );
}

function MemberAssigner({
  role,
  users,
  pending,
  run,
}: {
  role: AccessRole;
  users: TenantUser[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: (r: any) => void) => void;
}) {
  const [query, setQuery] = useState("");
  // Local view of membership for instant feedback (server revalidates after).
  const [assigned, setAssigned] = useState<Set<string>>(
    () => new Set(users.filter((u) => u.access_role_ids.includes(role.id)).map((u) => u.id)),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => {
        if (!q) return true;
        return (
          (u.full_name ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const am = assigned.has(a.id) ? 0 : 1;
        const bm = assigned.has(b.id) ? 0 : 1;
        return am - bm || (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "");
      });
  }, [users, query, assigned]);

  function toggle(userId: string) {
    const next = new Set(assigned);
    const on = next.has(userId);
    if (on) next.delete(userId);
    else next.add(userId);
    setAssigned(next);
    run(() => setUserAccessRole(userId, role.id, !on));
  }

  return (
    <div className="mt-5 border-t pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Members</p>
          <p className="text-xs text-muted-foreground">
            Tick a person to give them the “{role.name}” role.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border">
        <ul className="divide-y">
          {filtered.map((u) => {
            const on = assigned.has(u.id);
            return (
              <li key={u.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent",
                    on && "bg-primary/5",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={on}
                    disabled={pending}
                    onChange={() => toggle(u.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{u.full_name || u.email || "—"}</span>
                    {u.full_name && u.email && (
                      <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No people match “{query}”.
            </li>
          )}
        </ul>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {assigned.size} member{assigned.size === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function PermissionMatrix({
  assignable,
  perms,
  setPerms,
  disabled,
}: {
  assignable: TenantModule[];
  perms: PermissionMap;
  setPerms: (next: PermissionMap) => void;
  disabled: boolean;
}) {
  function toggle(slug: string, verb: Verb) {
    const cur = new Set<Verb>(perms[slug] ?? []);
    if (cur.has(verb)) cur.delete(verb);
    else cur.add(verb);
    const next = { ...perms };
    if (verb === "view" && !cur.has("view")) {
      delete next[slug];
    } else {
      if (cur.size > 0 && !cur.has("view")) cur.add("view");
      if (cur.size === 0) delete next[slug];
      else next[slug] = [...cur];
    }
    setPerms(next);
  }

  function preset(slug: string, kind: "full" | "read" | "none") {
    const caps = MODULE_CAPABILITIES[slug] ?? ["view"];
    const next = { ...perms };
    if (kind === "none") delete next[slug];
    else if (kind === "read") next[slug] = ["view"];
    else next[slug] = [...caps];
    setPerms(next);
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Module</th>
            {VERBS.map((v) => (
              <th key={v} className="px-2 py-2 font-medium" title={VERB_HINT[v]}>
                {VERB_LABEL[v]}
              </th>
            ))}
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {assignable.map((m) => {
            const caps = MODULE_CAPABILITIES[m.slug] ?? ["view"];
            const row = perms[m.slug] ?? [];
            const viewOff = !row.includes("view");
            return (
              <tr key={m.slug} className={cn(!m.is_active && "opacity-60")}>
                <td className="px-3 py-2 text-left font-medium">{m.name}</td>
                {VERBS.map((v) => {
                  if (!caps.includes(v)) {
                    return (
                      <td key={v} className="px-2 py-2 text-center text-muted-foreground/40">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={v} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={row.includes(v)}
                        disabled={disabled || (v !== "view" && viewOff)}
                        onChange={() => toggle(m.slug, v)}
                      />
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => preset(m.slug, "full")}
                    className="rounded-full border px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
                  >
                    Full
                  </button>{" "}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => preset(m.slug, "read")}
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                  >
                    Read
                  </button>{" "}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => preset(m.slug, "none")}
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                  >
                    None
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
