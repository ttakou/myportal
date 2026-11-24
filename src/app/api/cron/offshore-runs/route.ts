import { NextResponse } from "next/server";
import { remindUnconfirmedRuns } from "@/lib/offshore/run-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Midday reminder for runs the night job moved people on that nobody has
 * confirmed (Vercel Cron — see vercel.json): `?stage=desk` at 11:00 UTC
 * (12:00 Douala) for the Dispatcher, `?stage=oim` at 14:00 UTC for the OIM.
 * Guarded by CRON_SECRET like the other cron routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const stage = new URL(request.url).searchParams.get("stage") === "oim" ? "oim" : "desk";
  const res = await remindUnconfirmedRuns(stage);
  return NextResponse.json(res, { status: res.ok ? 200 : 503 });
}
