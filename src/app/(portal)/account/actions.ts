"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MutableCategory } from "@/lib/notification-categories";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

const CATEGORIES = ["transport", "flight", "approval", "general"];

/** Set the signed-in user's in-app / push / email preference for a category. */
export async function setNotificationPref(
  category: MutableCategory,
  channel: "in_app" | "push" | "email",
  enabled: boolean,
): Promise<ActionResult> {
  if (!CATEGORIES.includes(category)) return { ok: false, error: "Unknown category." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      profile_id: user.id,
      category,
      [channel]: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,category" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/account");
  return { ok: true };
}

// --- Access delegation --------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Delegate the signed-in user's access to a colleague for a bounded period.
 * The delegate gains the delegator's module permissions and (non-admin)
 * functional roles while the delegation is active — enforced in the DB.
 */
export async function createDelegation(input: {
  delegateId: string;
  startsOn: string;
  endsOn: string;
  note?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!input.delegateId) return { ok: false, error: "Choose a colleague to delegate to." };
  if (input.delegateId === user.id) return { ok: false, error: "You can't delegate to yourself." };
  if (!ISO_DATE.test(input.startsOn) || !ISO_DATE.test(input.endsOn)) {
    return { ok: false, error: "Pick a valid start and end date." };
  }
  if (input.endsOn < input.startsOn) {
    return { ok: false, error: "The end date must be on or after the start date." };
  }

  // The delegate must be a real, active member of the caller's tenant.
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { data: delegate } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", input.delegateId)
    .maybeSingle();
  if (!delegate) return { ok: false, error: "That person isn't in your organisation." };
  if (!delegate.is_active) return { ok: false, error: "That account is inactive." };

  const { error } = await supabase.from("access_delegations").insert({
    tenant_id: tenant.id,
    delegator_id: user.id,
    delegate_id: input.delegateId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/account");
  return { ok: true };
}

/** Revoke a delegation the signed-in user granted (ends it immediately). */
export async function revokeDelegation(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("access_delegations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/account");
  return { ok: true };
}
