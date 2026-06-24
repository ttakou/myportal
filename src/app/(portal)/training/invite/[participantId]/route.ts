import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** ISO timestamp -> iCalendar UTC stamp (YYYYMMDDTHHMMSSZ). */
function ics(dt: string): string {
  return new Date(dt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Download a calendar invitation (.ics) for a training session the signed-in
 * user is enrolled in. RLS on training_participants restricts the lookup to the
 * caller's own enrolments.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const { participantId } = await params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: part } = await supabase
    .from("training_participants")
    .select(
      "id, profile_id, session:training_sessions(id, starts_at, ends_at, location, course:training_courses(title), trainer:training_trainers(full_name))",
    )
    .eq("id", participantId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!part) return new NextResponse("Not found", { status: 404 });
  const session = Array.isArray(part.session) ? part.session[0] : (part.session as Record<string, any>);
  if (!session) return new NextResponse("Not found", { status: 404 });
  const course = Array.isArray(session.course) ? session.course[0] : session.course;
  const trainer = Array.isArray(session.trainer) ? session.trainer[0] : session.trainer;

  const title = course?.title ?? "Training session";
  const start = session.starts_at as string | null;
  const end = (session.ends_at as string | null) ?? start;
  if (!start) return new NextResponse("This session has no scheduled time yet.", { status: 409 });

  const now = new Date().toISOString();
  const descParts = [trainer?.full_name ? `Trainer: ${trainer.full_name}` : null].filter(Boolean) as string[];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//myportal//training//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:training-${part.id}@myportal`,
    `DTSTAMP:${ics(now)}`,
    `DTSTART:${ics(start)}`,
    `DTEND:${ics(end!)}`,
    `SUMMARY:${escapeText(`Training: ${title}`)}`,
    session.location ? `LOCATION:${escapeText(session.location as string)}` : null,
    descParts.length ? `DESCRIPTION:${escapeText(descParts.join("\\n"))}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="training-${part.id}.ics"`,
    },
  });
}
