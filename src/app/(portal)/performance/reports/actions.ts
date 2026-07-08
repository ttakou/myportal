"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import {
  ACCESS_ROLES,
  CHART_TYPES,
  DIMENSIONS,
  MEASURES,
  type ReportDefinition,
} from "@/types/reporting";

async function ensureHr() {
  const access = await getAccess();
  return access.isHr || access.isSystemAdmin || access.isAdmin;
}

export async function saveReportDefinition(input: ReportDefinition): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage reports." };
  if (!input.name?.trim()) return { ok: false, error: "Give the report a name." };
  if (input.measures.length === 0) return { ok: false, error: "Pick at least one measure." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fields = {
    name: input.name.trim(),
    description: input.description?.toString().trim() || null,
    dimensions: input.dimensions.filter((d) => DIMENSIONS.includes(d)),
    measures: input.measures.filter((m) => MEASURES.includes(m)),
    filters: (input.filters ?? []).filter((f) => f.dimension && f.value?.trim()),
    chart_type: CHART_TYPES.includes(input.chartType) ? input.chartType : "table",
    schedule: input.schedule ?? null,
    is_widget: !!input.isWidget,
    role_access: (input.roleAccess ?? ["hr"]).filter((r) => ACCESS_ROLES.includes(r)),
    updated_at: new Date().toISOString(),
  };

  if (input.id && !input.id.startsWith("new-")) {
    const { error } = await supabase.from("report_definitions").update(fields).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (!tenant) return { ok: false, error: "No tenant in scope." };
    const { error } = await supabase
      .from("report_definitions")
      .insert({ ...fields, tenant_id: tenant.id, created_by: user?.id ?? null });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/performance/reports");
  return { ok: true };
}

export async function deleteReportDefinition(id: string): Promise<ActionResult> {
  if (!(await ensureHr())) return { ok: false, error: "Only HR can manage reports." };
  const supabase = createClient();
  const { error } = await supabase.from("report_definitions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/reports");
  return { ok: true };
}
