"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };
const rev = () => revalidatePath("/performance");
async function tenantId(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id as string | undefined;
}

export async function createObjective(input: {
  title: string;
  period: string;
}): Promise<ActionResult> {
  if (!input.title.trim()) return { ok: false, error: "Title is required." };
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("okr_objectives")
    .insert({ tenant_id: t, title: input.title.trim(), period: input.period.trim() || "Q2 2026" });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function addKeyResult(input: {
  objectiveId: string;
  title: string;
  target: number;
  unit?: string;
}): Promise<ActionResult> {
  if (!input.title.trim()) return { ok: false, error: "Key result title is required." };
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("okr_key_results").insert({
    tenant_id: t,
    objective_id: input.objectiveId,
    title: input.title.trim(),
    target: input.target || 100,
    unit: input.unit?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function updateKeyResult(id: string, current: number): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("okr_key_results")
    .update({ current })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function closeObjective(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("okr_objectives")
    .update({ status: "closed" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function giveFeedback(toId: string, body: string): Promise<ActionResult> {
  if (!toId) return { ok: false, error: "Select a colleague." };
  if (!body.trim()) return { ok: false, error: "Feedback cannot be empty." };
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("perf_feedback")
    .insert({ tenant_id: t, to_id: toId, body: body.trim() });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setNineBox(input: {
  profileId: string;
  performance: number;
  potential: number;
  period: string;
}): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole()))
    return { ok: false, error: "Only managers/admins can set the 9-box." };
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("nine_box").upsert(
    {
      tenant_id: t,
      profile_id: input.profileId,
      period: input.period,
      performance: input.performance,
      potential: input.potential,
    },
    { onConflict: "tenant_id,profile_id,period" },
  );
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}
