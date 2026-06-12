"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AccessRole } from "@/lib/access-roles";
import type { TenantModule } from "@/lib/admin";
import { createAccessRole, deleteAccessRole, updateAccessRole } from "../actions";

/**
 * Role definition area: named access roles, each granting a set of modules.
 * Users with no role are unrestricted; users with roles see only the union of
 * their roles' modules. Assignment happens on the People table.
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
        A role grants access to a set of modules. People with no role can use every active
        module; people with one or more roles are limited to what their roles grant. Assign
        roles in the People table below.
      </p>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {roles.map((r) => (
          <RoleCard key={r.id} role={r} assignable={assignable} pending={pending} run={run} />
        ))}
        <NewRoleCard assignable={assignable} pending={pending} run={run} />
      </div>
    </section>
  );
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

function ModuleChecks({
  assignable,
  selected,
  onToggle,
  disabled,
}: {
  assignable: TenantModule[];
  selected: string[];
  onToggle: (slug: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {assignable.map((m) => (
        <label
          key={m.slug}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
            selected.includes(m.slug) && "border-primary bg-primary/5",
            !m.is_active && "opacity-60",
          )}
        >
          <input
            type="checkbox"
            checked={selected.includes(m.slug)}
            disabled={disabled}
            onChange={() => onToggle(m.slug)}
          />
          {m.name}
        </label>
      ))}
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
  const [slugs, setSlugs] = useState<string[]>(role.module_slugs);
  const dirty =
    name !== role.name ||
    description !== (role.description ?? "") ||
    slugs.slice().sort().join(",") !== role.module_slugs.slice().sort().join(",");

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm font-medium"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
          />
        </div>
        <button
          type="button"
          title="Delete role"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete the "${role.name}" role? ${role.member_count} member(s) will lose it.`)) {
              run(() => deleteAccessRole(role.id));
            }
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <ModuleChecks
          assignable={assignable}
          selected={slugs}
          disabled={pending}
          onToggle={(slug) =>
            setSlugs((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]))
          }
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
              run(() => updateAccessRole({ id: role.id, name, description, moduleSlugs: slugs }))
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
  const [slugs, setSlugs] = useState<string[]>([]);

  return (
    <div className="rounded-lg border border-dashed bg-card/50 p-4">
      <p className="text-sm font-medium text-muted-foreground">New role</p>
      <div className="mt-2 space-y-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name (e.g. Field staff)"
          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
        />
      </div>
      <div className="mt-3">
        <ModuleChecks
          assignable={assignable}
          selected={slugs}
          disabled={pending}
          onToggle={(slug) =>
            setSlugs((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]))
          }
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={pending || !name.trim()}
          onClick={() =>
            run(
              () => createAccessRole({ name, description, moduleSlugs: slugs }),
              () => {
                setName("");
                setDescription("");
                setSlugs([]);
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
