import { NextResponse } from "next/server";
import { runOffshoreSchedule } from "@/lib/offshore/schedule-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly offshore schedule (Vercel Cron, 04:00 UTC — see vercel.json).
 *
 * Opens the day's crew changes where the tenant lets the schedule act,
 * prompts the desk where it does not, reminds people three days before a
 * crew change, and flags or cancels trips nobody took. Guarded by
 * CRON_SECRET like the other cron routes; `?date=YYYY-MM-DD` runs it as if
 * for that day (for checking what tomorrow will do).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const date = new URL(request.url).searchParams.get("date");
  const summary = await runOffshoreSchedule(
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
  );
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
