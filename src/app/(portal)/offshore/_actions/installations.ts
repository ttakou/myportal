"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, rev, tenantId } from "./_shared";

export async function upsertInstallation(input: {
  id?: string;
  name: string;
  pobCapacity?: number;
}): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  if (!input.name.trim()) return { ok: false, error: "Installation name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: tenant,
    name: input.name.trim(),
    pob_capacity: Math.max(0, Math.floor(input.pobCapacity ?? 0)),
  };
  const { error } = input.id
    ? await supabase.from("offshore_installations").update(row).eq("id", input.id)
    : await supabase.from("offshore_installations").insert(row);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setInstallationActive(id: string, isActive: boolean): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_installations")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
