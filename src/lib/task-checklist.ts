import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHECKLIST_TEMPLATE, type TransportTaskType } from "@/types/transport";

/**
 * Seed the default checklist for a freshly created transport task. Best-effort:
 * runs as the creating user (RLS allows the requester or a dispatcher), and a
 * failure never blocks task creation.
 */
export async function seedTaskChecklist(
  supabase: SupabaseClient,
  tenantId: string,
  requestId: string,
  taskType: TransportTaskType,
): Promise<void> {
  const labels = CHECKLIST_TEMPLATE[taskType] ?? [];
  if (labels.length === 0) return;
  await supabase.from("transport_task_checklist").insert(
    labels.map((label, i) => ({
      tenant_id: tenantId,
      request_id: requestId,
      label,
      sort_order: i,
    })),
  );
}
