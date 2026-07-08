"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import { cleanMatrix, type PermissionMatrix } from "@/types/perf-permissions";

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

export async function savePermissionMatrix(input: PermissionMatrix): Promise<ActionResult> {
  if (!(await ensureHr())) {
    return { ok: false, error: "Only HR can change performance permissions." };
  }
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const matrix = cleanMatrix(input);
  const { error } = await supabase
    .from("performance_permission_settings")
    .upsert(
      { tenant_id: tenant.id, matrix, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/settings/permissions");
  return { ok: true };
}
