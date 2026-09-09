import { NextResponse } from "next/server";
import { runTransportShuttles } from "@/lib/transport-shuttle-run";
import { localDate } from "@/lib/transport/day-plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily shuttle runs (Vercel Cron, 02:30 UTC — see vercel.json): every
 * active recurring shuttle that runs today gets its task, so the dispatch
 * desk starts the day with the regular runs already on the board. Guarded
 * by CRON_SECRET like the other cron routes; `?date=YYYY-MM-DD` creates
 * another day's runs.
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
  const summary = await runTransportShuttles(
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(new Date().toISOString()),
  );
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
