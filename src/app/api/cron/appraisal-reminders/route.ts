import { NextResponse } from "next/server";
import { runAppraisalReminders } from "@/lib/appraisal-reminders";
import { runWorkflowEscalations } from "@/lib/workflow-escalation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily appraisal reminders & escalation (Vercel Cron — see vercel.json).
 * Flags overdue goal-setting and nudges the current owner of each in-progress
 * appraisal. Guarded by CRON_SECRET like the other cron routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const [summary, workflow] = await Promise.all([
    runAppraisalReminders(),
    runWorkflowEscalations(),
  ]);
  return NextResponse.json({ ...summary, workflow });
}
