"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A person declares their own certificate dates, emergency contact and
 * back-to-back from the dashboard.
 *
 * The roster stays the dispatcher's to write; the database function this
 * calls updates those five fields on the caller's own row and nothing else,
 * and leaves alone any field passed empty. Dates must be real and, for a
 * certificate, not in the past — a declaration of an expired certificate is
 * not a declaration, it is the gap the prompt is trying to close.
 */
export async function declareOffshoreProfile(input: {
  medicalExpiry?: string;
  bosietExpiry?: string;
  huetExpiry?: string;
  emergencyContact?: string;
  backToBackId?: string;
}): Promise<ActionResult> {
  const today = new Date().toISOString().slice(0, 10);
  const date = (v: string | undefined, label: string): string | null | { error: string } => {
    const s = (v ?? "").trim();
    if (!s) return null;
    if (!DATE.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z")))
      return { error: `${label}: enter a date as YYYY-MM-DD.` };
    if (s < today) return { error: `${label}: that date has passed. Enter the expiry of your current certificate.` };
    return s;
  };
  const medical = date(input.medicalExpiry, "Offshore medical");
  const bosiet = date(input.bosietExpiry, "BOSIET");
  const huet = date(input.huetExpiry, "HUET");
  for (const d of [medical, bosiet, huet]) {
    if (d && typeof d === "object") return { ok: false, error: d.error };
  }
  const contact = (input.emergencyContact ?? "").trim();
  const b2b = (input.backToBackId ?? "").trim();
  if (!medical && !bosiet && !huet && !contact && !b2b) {
    return { ok: false, error: "Fill in at least one field." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("offshore_self_declare", {
    p_medical_expiry: medical as string | null,
    p_bosiet_expiry: bosiet as string | null,
    p_huet_expiry: huet as string | null,
    p_emergency_contact: contact || null,
    p_back_to_back_id: b2b || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/offshore");
  return { ok: true };
}
