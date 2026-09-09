import { NextResponse } from "next/server";
import { runTransportShuttles } from "@/lib/transport-shuttle-run";
import { escalateStaleApprovals } from "@/lib/transport-approval-escalation";
import { localDate } from "@/lib/transport/day-plan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily transport job (Vercel Cron, 02:30 UTC — see vercel.json).
 * Every active recurring shuttle that runs today gets its task, so the
 * dispatch desk starts the day with the regular runs already on the board;
 * then ride requests a line manager has left unanswered past the tenant's
 * escalation delay are passed to the desk. Guarded by CRON_SECRET like the
 * other cron routes; `?date=YYYY-MM-DD` creates another day's runs.
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
  const shuttles = await runTransportShuttles(
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate(new Date().toISOString()),
  );
  const approvals = await escalateStaleApprovals();
  const ok = shuttles.ok && approvals.ok;
  return NextResponse.json({ ok, shuttles, approvals }, { status: ok ? 200 : 503 });
}
