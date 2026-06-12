import { NextResponse } from "next/server";
import { runFlightTracking } from "@/lib/flight-tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled flight tracking (Vercel Cron, hourly — see vercel.json).
 *
 * Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to cron invocations
 * when CRON_SECRET is set; we require it so the endpoint can't be triggered by
 * the public. If CRON_SECRET is unset, the route refuses to run.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runFlightTracking();
  return NextResponse.json({ ok: true, ...summary });
}
