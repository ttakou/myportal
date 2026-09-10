import { NextResponse } from "next/server";
import { runCanteenLive } from "@/lib/canteen-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The canteen job (Vercel Cron, every 15 minutes — see vercel.json): the
 * book-by reminder before the cutoff, "tomorrow's menu is out", and the
 * repeat no-show warnings. Guarded by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runCanteenLive();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
