"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, History, Loader2, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseHistory, CourseHistorySession } from "@/lib/training";
import { getCourseSessionParticipants } from "../actions";

type Participant = { full_name: string; status: string; score: number | null };

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  planned: "bg-muted text-muted-foreground",
  open: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  cancelled: "bg-destructive/10 text-destructive line-through",
};
const PARTICIPANT_LABEL: Record<string, string> = {
  enrolled: "Enrolled",
  attended: "Attended",
  passed: "Passed",
  failed: "Failed",
  no_show: "No-show",
  cancelled: "Cancelled",
};

function day(ts: string | null): string {
  return ts ? ts.slice(0, 10) : "—";
}
function range(s: CourseHistorySession): string {
  const a = day(s.starts_at);
  const b = day(s.ends_at);
  return a === b || b === "—" ? a : `${a} → ${b}`;
}

/**
 * HR view: the full history of one course — every session ever organised
 * (newest first) and who took part, plus completions recorded outside a
 * session. Participant lists load lazily when a session row is expanded;
 * the most recent session arrives pre-expanded from the server.
 */
export function CourseHistoryPanel({
  courses,
  selected,
  history,
  initialParticipants,
}: {
  courses: { id: string; title: string; code: string | null }[];
  selected: string | null;
  history: CourseHistory | null;
  /** Participants of the most recent session, preloaded server-side. */
  initialParticipants: Participant[];
}) {
  const router = useRouter();
  const firstId = history?.sessions[0]?.id ?? null;
  const [open, setOpen] = useState<Set<string>>(new Set(firstId ? [firstId] : []));
  const [people, setPeople] = useState<Map<string, Participant[]>>(
    new Map(firstId ? [[firstId, initialParticipants]] : []),
  );
  const [loading, setLoading] = useState<string | null>(null);

  async function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) {
      next.delete(id);
      setOpen(next);
      return;
    }
    next.add(id);
    setOpen(next);
    if (!people.has(id)) {
      setLoading(id);
      const list = await getCourseSessionParticipants(id);
      setPeople((m) => new Map(m).set(id, list));
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Course
          <select
            value={selected ?? ""}
            onChange={(e) =>
              router.push(
                e.target.value
                  ? `/training?view=course-history&course=${e.target.value}`
                  : "/training?view=course-history",
              )
            }
            className="mt-1 block min-w-64 rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Pick a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} · ` : ""}
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!selected && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Pick a course to see every time it was organised and who took it.
        </p>
      )}

      {selected && history && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Times organised", value: String(history.summary.timesOrganised) },
              { label: "People trained", value: String(history.summary.peopleTrained) },
              { label: "Completions", value: String(history.summary.totalCompletions) },
              { label: "Last held", value: history.summary.lastHeld ? day(history.summary.lastHeld) : "never" },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>

          {history.sessions.length === 0 && history.externalRecords.length === 0 && (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              This course has never been organised and holds no completion records yet.
            </p>
          )}

          <div className="space-y-2">
            {history.sessions.map((s) => {
              const isOpen = open.has(s.id);
              const list = people.get(s.id);
              return (
                <div key={s.id} className="rounded-lg border bg-card">
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-accent/50"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium tabular-nums">{range(s)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_STYLE[s.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {s.status.replace("_", " ")}
                    </span>
                    {s.title && <span className="text-muted-foreground">{s.title}</span>}
                    {s.location && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {s.location}
                      </span>
                    )}
                    {s.trainer_name && (
                      <span className="text-xs text-muted-foreground">· {s.trainer_name}</span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> {s.enrolled}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t px-3 py-2.5">
                      {loading === s.id ? (
                        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading participants…
                        </p>
                      ) : !list || list.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No participants recorded.</p>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {list.map((p, i) => (
                            <li
                              key={i}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-xs",
                                p.status === "passed" || p.status === "attended"
                                  ? "border-green-200 bg-green-50 text-green-900"
                                  : p.status === "failed" || p.status === "no_show"
                                    ? "border-red-200 bg-red-50 text-red-900"
                                    : "bg-background",
                              )}
                              title={PARTICIPANT_LABEL[p.status] ?? p.status}
                            >
                              {p.full_name}
                              {p.score != null && ` · ${p.score}%`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {history.externalRecords.length > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <History className="h-4 w-4 text-muted-foreground" />
                Recorded outside a session ({history.externalRecords.length})
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {history.externalRecords.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-full border bg-background px-2 py-0.5 text-xs"
                    title={`Completed ${r.completed_on}${r.expires_on ? ` · expires ${r.expires_on}` : ""} · ${r.source}`}
                  >
                    {r.full_name} · {r.completed_on}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
