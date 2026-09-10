import { NextResponse } from "next/server";
import { runVisitorsEvening } from "@/lib/visitors-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The evening visitor job (Vercel Cron, 16:00 UTC = 17:00 site time — see
 * vercel.json): yesterday's no-shows closed, tomorrow's expected list sent
 * to reception and each host. Guarded by CRON_SECRET like the other cron
 * routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runVisitorsEvening();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
