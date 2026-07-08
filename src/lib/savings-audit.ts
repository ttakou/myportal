import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type SavingsAuditEntity =
  | "account"
  | "transaction"
  | "import_batch"
  | "withdrawal"
  | "config"
  | "interest";

/**
 * Record a savings-module action in the audit trail. Best-effort: any failure is
 * logged and swallowed so it can never break the underlying action. Uses the
 * service role so it works regardless of who performed the action.
 */
export async function logSavings(opts: {
  tenantId: string;
  actorId?: string | null;
  action: string;
  entity: SavingsAuditEntity;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = createAdminClient();
    if (!db) return;
    await db.from("savings_audit_log").insert({
      tenant_id: opts.tenantId,
      actor_id: opts.actorId ?? null,
      action: opts.action,
      entity: opts.entity,
      entity_id: opts.entityId ?? null,
      summary: opts.summary,
      meta: opts.meta ?? {},
    });
  } catch (e) {
    console.error("savings audit log failed:", (e as Error).message);
  }
}
