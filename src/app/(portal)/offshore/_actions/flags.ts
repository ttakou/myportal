"use server";

import { createClient } from "@/lib/supabase/server";
import { getRotationFlags } from "@/lib/offshore";
import type { ActionResult } from "@/types/actions";
import type { RotationFlag, RotationFlagKind, RotationFlagReason } from "@/types/offshore";
import { requireOffshoreDispatch, rev, tenantId } from "./_shared";

const KINDS: RotationFlagKind[] = ["absent", "early_arrival", "early_departure", "late_arrival"];
const REASONS: RotationFlagReason[] = ["sick", "medevac", "compassionate", "training_logistics", "other"];

export async function fetchRotationFlags(
  includeResolved = false,
): Promise<{ ok: boolean; flags?: RotationFlag[]; error?: string }> {
  const gate = await requireOffshoreDispatch("view");
  if (gate) return gate;
  return { ok: true, flags: await getRotationFlags(includeResolved) };
}

/** Flag a rotation exception (early comer/leaver, absentee) with a reason. */
export async function addRotationFlag(input: {
  profileId: string;
  installationId?: string;
  kind: RotationFlagKind;
  reason: RotationFlagReason;
  note?: string;
  effectiveDate?: string;
}): Promise<ActionResult> {
  const gate = await requireOffshoreDispatch("operate");
  if (gate) return gate;
  if (!input.profileId) return { ok: false, error: "Pick a staff member." };
  if (!KINDS.includes(input.kind)) return { ok: false, error: "Pick what happened." };
  if (!REASONS.includes(input.reason)) return { ok: false, error: "Pick a reason." };
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("offshore_rotation_flags").insert({
    tenant_id: tenant,
    profile_id: input.profileId,
    installation_id: input.installationId || null,
    kind: input.kind,
    reason: input.reason,
    note: input.note?.trim() || null,
    effective_date: input.effectiveDate || new Date().toISOString().slice(0, 10),
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Clear a flag once dealt with (resolved), or delete it outright. */
export async function resolveRotationFlag(id: string, remove = false): Promise<ActionResult> {
  const gate = await requireOffshoreDispatch("operate");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = remove
    ? await supabase.from("offshore_rotation_flags").delete().eq("id", id)
    : await supabase
        .from("offshore_rotation_flags")
        .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
        .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
