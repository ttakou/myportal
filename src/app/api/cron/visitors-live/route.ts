import { NextResponse } from "next/server";
import { runVisitorsLive } from "@/lib/visitors-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The live visitor job (Vercel Cron, every 15 minutes — see vercel.json):
 * past the tenant's cutoff, security and the host hear about anyone still
 * on site, once a day per visit. Guarded by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runVisitorsLive();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
