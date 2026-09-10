import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { holdersOfVerb } from "@/lib/verb-holders";

/**
 * Who the dispatch desk is: the active people whose access role grants the
 * transportation `approve` or `manage` verb, else every tenant admin.
 */
export async function deskIdsFor(client: SupabaseClient, tenantId: string): Promise<string[]> {
  return holdersOfVerb(client, tenantId, "transportation", ["approve", "manage"]);
}
