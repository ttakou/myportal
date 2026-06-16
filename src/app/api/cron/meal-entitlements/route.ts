import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monthly canteen meal-entitlement renewal (Vercel Cron — see vercel.json).
 *
 * Re-affirms every active entitlement and writes a per-tenant audit row for the
 * current month. Like the flights cron, it requires the CRON_SECRET bearer
 * token so it can't be triggered publicly.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 503 },
    );
  }

  const { data, error } = await admin.rpc("canteen_run_monthly_renewal");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { tenant_id: string; active_count: number }[];
  const renewed = rows.reduce((n, r) => n + (r.active_count ?? 0), 0);
  return NextResponse.json({ ok: true, tenants: rows.length, entitlements_renewed: renewed });
}
