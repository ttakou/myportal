import { createClient } from "@/lib/supabase/server";
import type { RotationFlag, RotationFlagKind, RotationFlagReason } from "@/types/offshore";
import { one } from "./_shared";

/**
 * Rotation/attendance exception flags — early comers/leavers and absentees,
 * each with a reason. Active (unresolved) first, newest by effective date.
 */
export async function getRotationFlags(includeResolved = false): Promise<RotationFlag[]> {
  const supabase = createClient();
  let q = supabase
    .from("offshore_rotation_flags")
    .select(
      "id, profile_id, kind, reason, note, effective_date, created_at, resolved_at," +
        " person:profiles!offshore_rotation_flags_profile_id_fkey(full_name)," +
        " installation:offshore_installations(name)",
    )
    .order("resolved_at", { ascending: true, nullsFirst: true })
    .order("effective_date", { ascending: false });
  if (!includeResolved) q = q.is("resolved_at", null);
  const { data } = await q;
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id as string,
    profile_id: r.profile_id as string,
    name: one<{ full_name?: string }>(r.person)?.full_name ?? "—",
    installation_name: one<{ name?: string }>(r.installation)?.name ?? null,
    kind: r.kind as RotationFlagKind,
    reason: r.reason as RotationFlagReason,
    note: (r.note as string | null) ?? null,
    effective_date: r.effective_date as string,
    created_at: r.created_at as string,
    resolved_at: (r.resolved_at as string | null) ?? null,
  }));
}
