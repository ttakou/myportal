import { NextResponse } from "next/server";
import { runScheduledReports } from "@/lib/report-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily scheduled-report delivery (Vercel Cron). Emails any report whose
 * schedule is due today to its recipients. Guarded by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runScheduledReports();
  return NextResponse.json(summary);
}
