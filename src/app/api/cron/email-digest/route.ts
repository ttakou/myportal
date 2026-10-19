import { NextResponse } from "next/server";
import { runEmailDigest } from "@/lib/email-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The morning email digest (Vercel Cron, 06:00 UTC = 07:00 site time — see
 * vercel.json): one email per person with the last day's notifications.
 * Does nothing until RESEND_API_KEY and EMAIL_FROM are set. Guarded by
 * CRON_SECRET like the other cron routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runEmailDigest();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
