/**
 * Granular per-module permissions (client-safe constants & helpers).
 *
 * An access role grants, per module, a set of action verbs. A user's effective
 * permissions are the union across their assigned roles. This module has NO
 * server-only imports so it can be used by client components (the matrix editor)
 * and server code alike. Server-side reads/guards live in permissions-server.ts.
 */

export const VERBS = ["view", "create", "edit", "approve", "operate", "manage"] as const;
export type Verb = (typeof VERBS)[number];

export const VERB_LABEL: Record<Verb, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  approve: "Approve",
  operate: "Operate",
  manage: "Manage",
};

export const VERB_HINT: Record<Verb, string> = {
  view: "See the module and its data",
  create: "Raise / submit new records",
  edit: "Modify existing records",
  approve: "Approve / decide / confirm",
  operate: "Front-line duties (serve, drive, muster, check-in)",
  manage: "Configure the module & delete",
};

/** Which verbs are meaningful for each module (drives the matrix + validation). */
export const MODULE_CAPABILITIES: Record<string, Verb[]> = {
  emergency: ["view", "create", "approve", "manage"],
  canteen: ["view", "create", "edit", "approve", "operate", "manage"],
  transportation: ["view", "create", "edit", "approve", "operate", "manage"],
  "out-of-town": ["view", "create", "edit", "approve", "operate", "manage"],
  offshore: ["view", "create", "edit", "approve", "operate", "manage"],
  visitors: ["view", "create", "edit", "operate"],
  medical: ["view", "create", "manage"],
  savings: ["view", "create", "approve", "operate"],
  performance: ["view", "create", "edit", "approve"],
};

export type PermissionMap = Record<string, Verb[]>;

export function hasPermission(perms: PermissionMap, slug: string, verb: Verb): boolean {
  return (perms[slug] ?? []).includes(verb);
}

/**
 * Sanitise a permission map: drop unknown modules/verbs, and ensure any module
 * with at least one verb also has "view" (you can't act on what you can't see).
 */
export function cleanPermissions(input: Record<string, string[]> | null | undefined): PermissionMap {
  const out: PermissionMap = {};
  for (const [slug, verbs] of Object.entries(input ?? {})) {
    const caps = MODULE_CAPABILITIES[slug];
    if (!caps) continue;
    const kept = [...new Set((verbs ?? []).filter((v): v is Verb => caps.includes(v as Verb)))];
    if (kept.length === 0) continue;
    if (!kept.includes("view")) kept.unshift("view");
    out[slug] = kept;
  }
  return out;
}

/** Modules a permission map makes visible (those granting "view"). */
export function viewableSlugs(perms: PermissionMap): string[] {
  return Object.keys(perms).filter((s) => perms[s].includes("view"));
}
