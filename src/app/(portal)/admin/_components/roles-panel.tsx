"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AccessRole } from "@/lib/access-roles";
import type { TenantModule } from "@/lib/admin";
import {
  MODULE_CAPABILITIES,
  VERBS,
  VERB_HINT,
  VERB_LABEL,
  type PermissionMap,
  type Verb,
} from "@/lib/permissions";
import { createAccessRole, deleteAccessRole, updateAccessRole } from "../actions";

/**
 * Role definition area: named access roles, each granting a set of per-module
 * action permissions (view / create / edit / approve / operate / manage).
 * A user sees a module only if a role grants "view"; each action is gated on the
 * matching verb. Assignment happens on the People table.
 */
export function RolesPanel({
  roles,
  modules,
}: {
  roles: AccessRole[];
  modules: TenantModule[];
}) {
  const assignable = modules.filter((m) => !m.is_core);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Access roles</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Each role decides, per module, what its members can do — see, create, edit,
        approve, operate or manage. A module is hidden unless the role grants
        <b> View</b>. Assign roles to people in the table below.
      </p>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-4">
        {roles.map((r) => (
          <RoleCard key={r.id} role={r} assignable={assignable} pending={pending} run={run} />
        ))}
        <NewRoleCard assignable={assignable} pending={pending} run={run} />
      </div>
    </section>
  );
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

/** Stable string for dirty-checking a permission map. */
function permsKey(p: PermissionMap): string {
  return Object.keys(p)
    .sort()
    .map((s) => `${s}:${[...p[s]].sort().join("+")}`)
    .join("|");
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
      delete next[slug]; // hiding the module clears every verb
    } else {
      if (cur.size > 0 && !cur.has("view")) cur.add("view"); // acting implies view
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

function RoleCard({
  role,
  assignable,
  pending,
  run,
}: {
  role: AccessRole;
  assignable: TenantModule[];
  pending: boolean;
  run: Runner;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [perms, setPerms] = useState<PermissionMap>(role.permissions ?? {});
  const dirty =
    name !== role.name ||
    description !== (role.description ?? "") ||
    permsKey(perms) !== permsKey(role.permissions ?? {});

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-sm font-medium"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-xs"
          />
        </div>
        <button
          type="button"
          title="Delete role"
          disabled={pending}
          onClick={() => {
            if (
              confirm(`Delete the "${role.name}" role? ${role.member_count} member(s) will lose it.`)
            ) {
              run(() => deleteAccessRole(role.id));
            }
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <PermissionMatrix
          assignable={assignable}
          perms={perms}
          setPerms={setPerms}
          disabled={pending}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {role.member_count} member{role.member_count === 1 ? "" : "s"}
        </span>
        {dirty && (
          <Button
            size="sm"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(() => updateAccessRole({ id: role.id, name, description, permissions: perms }))
            }
          >
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

function NewRoleCard({
  assignable,
  pending,
  run,
}: {
  assignable: TenantModule[];
  pending: boolean;
  run: Runner;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<PermissionMap>({});

  return (
    <div className="rounded-lg border border-dashed bg-card/50 p-4">
      <p className="text-sm font-medium text-muted-foreground">New role</p>
      <div className="mt-2 space-y-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name (e.g. Field staff)"
          className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-xs"
        />
      </div>
      <div className="mt-3">
        <PermissionMatrix
          assignable={assignable}
          perms={perms}
          setPerms={setPerms}
          disabled={pending}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={pending || !name.trim()}
          onClick={() =>
            run(
              () => createAccessRole({ name, description, permissions: perms }),
              () => {
                setName("");
                setDescription("");
                setPerms({});
              },
            )
          }
        >
          Create role
        </Button>
      </div>
    </div>
  );
}
