import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one, todayIso } from "./_shared";
import { offshoreProfileGaps, type ProfileGap } from "./profile-gaps";
import { getWhereaboutsPeople } from "./whereabouts";

/** The signed-in person's own roster row, as the dashboard prompt needs it. */
export interface MyOffshoreProfile {
  medical_expiry: string | null;
  bosiet_expiry: string | null;
  huet_expiry: string | null;
  emergency_contact: string | null;
  back_to_back_id: string | null;
  back_to_back_name: string | null;
  is_rotational: boolean;
  gaps: ProfileGap[];
  /** Everyone else on the roster, for the back-to-back picker. */
  people: { id: string; name: string; crew: string | null }[];
}

export async function getMyOffshoreProfile(): Promise<MyOffshoreProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("offshore_staff")
    .select(
      "medical_expiry, bosiet_expiry, huet_expiry, emergency_contact, back_to_back_id, is_rotational, b2b:profiles!offshore_staff_back_to_back_id_fkey(full_name)",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const base = {
    medical_expiry: (row.medical_expiry as string | null) ?? null,
    bosiet_expiry: (row.bosiet_expiry as string | null) ?? null,
    huet_expiry: (row.huet_expiry as string | null) ?? null,
    emergency_contact: (row.emergency_contact as string | null) ?? null,
    back_to_back_id: (row.back_to_back_id as string | null) ?? null,
    is_rotational: (row.is_rotational as boolean | null) ?? true,
  };
  const gaps = offshoreProfileGaps(base, todayIso());
  // The picker is only needed when a back-to-back is being asked for.
  const people = gaps.some((g) => g.key === "back_to_back")
    ? (await getWhereaboutsPeople()).filter((p) => p.id !== user.id)
    : [];
  return {
    ...base,
    back_to_back_name: one<{ full_name?: string }>((row.b2b as never) ?? null)?.full_name ?? null,
    gaps,
    people,
  };
}
