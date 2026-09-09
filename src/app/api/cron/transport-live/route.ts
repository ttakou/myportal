import { NextResponse } from "next/server";
import { runTransportLive } from "@/lib/transport-live-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The live transport job (Vercel Cron, every five minutes — see
 * vercel.json): driver reminders before departure, and desk alerts for
 * tasks past departure that nobody has started. Guarded by CRON_SECRET
 * like the other cron routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runTransportLive();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}
