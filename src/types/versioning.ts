export type ConfigStatus = "draft" | "published" | "archived";

export const CONFIG_STATUSES: ConfigStatus[] = ["draft", "published", "archived"];

export const CONFIG_STATUS_LABEL: Record<ConfigStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/**
 * Effective-dating metadata shared by versioned config objects (rating scales,
 * cycle templates, goal templates…). Config changes create new versions with
 * their own effective window, so completed historical assessments — which bind
 * to the version that was effective when they ran — are never altered.
 */
export interface Versioned {
  effectiveFrom: string | null;
  effectiveTo: string | null;
  version: number;
  status: ConfigStatus;
  publishedAt: string | null;
}

/** Whether a versioned object is in force on a given date (default: today). */
export function isEffectiveOn(
  v: Pick<Versioned, "effectiveFrom" | "effectiveTo" | "status">,
  dateIso: string = new Date().toISOString(),
): boolean {
  if (v.status !== "published") return false;
  const d = dateIso.slice(0, 10);
  if (v.effectiveFrom && v.effectiveFrom.slice(0, 10) > d) return false;
  if (v.effectiveTo && v.effectiveTo.slice(0, 10) < d) return false;
  return true;
}

/** Map a DB row's versioning columns onto the shared shape. */
export function versionedFromRow(r: Record<string, unknown>): Versioned {
  return {
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    version: Number(r.version ?? 1),
    status: (r.status as ConfigStatus) ?? "published",
    publishedAt: (r.published_at as string | null) ?? null,
  };
}
