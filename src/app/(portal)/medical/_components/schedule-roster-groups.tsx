"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MedicalSchedule } from "@/types/medical";
import { getScheduleBatch } from "../actions";
import { VisitCompleteButton } from "./visit-complete-button";
import { RecordResultButton } from "./record-result-dialog";

export type ScheduleGroup = {
  key: string;
  year: number;
  visit1_date: string;
  visit2_date: string | null;
  visit1_time: string | null;
  visit2_time: string | null;
  count: number;
};

function fmtD(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MembersTable({ rows }: { rows: MedicalSchedule[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5">Employee</th>
            <th className="px-3 py-1.5">Location</th>
            <th className="px-3 py-1.5">1st visit</th>
            <th className="px-3 py-1.5">2nd visit</th>
            <th className="px-3 py-1.5">Exams</th>
            <th className="px-3 py-1.5">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 font-medium">{r.person_name ?? "—"}</td>
              <td className="px-3 py-2">{r.work_location ?? "—"}</td>
              <td className="px-3 py-2">
                <VisitCompleteButton scheduleId={r.id} visit={1} completedAt={r.visit1_completed_at} />
              </td>
              <td className="px-3 py-2">
                <VisitCompleteButton scheduleId={r.id} visit={2} completedAt={r.visit2_completed_at} />
              </td>
              <td className="px-3 py-2 text-muted-foreground">{r.exam_indicators ?? "—"}</td>
              <td className="px-3 py-2">
                <RecordResultButton
                  scheduleId={r.id}
                  personName={r.person_name ?? null}
                  defaultExamDate={r.visit2_date ?? r.visit1_date}
                  alreadyRecorded={Boolean(r.visit2_completed_at)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * All schedule batches across history. The most recent batch is expanded with
 * its members preloaded; the rest show just the period + count and pull their
 * member rows only when the user expands them.
 */
export function ScheduleRosterGroups({
  groups,
  initialKey,
  initialMembers,
}: {
  groups: ScheduleGroup[];
  initialKey: string | null;
  initialMembers: MedicalSchedule[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(initialKey ? [initialKey] : []));
  const [members, setMembers] = useState<Record<string, MedicalSchedule[]>>(
    initialKey ? { [initialKey]: initialMembers } : {},
  );
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<Record<string, string>>({});

  async function toggle(g: ScheduleGroup) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(g.key)) n.delete(g.key);
      else n.add(g.key);
      return n;
    });
    // Pull members the first time this batch is opened.
    if (!open.has(g.key) && !members[g.key] && !loading.has(g.key)) {
      setLoading((s) => new Set(s).add(g.key));
      const res = await getScheduleBatch(g.visit1_date, g.visit2_date);
      setLoading((s) => {
        const n = new Set(s);
        n.delete(g.key);
        return n;
      });
      if (res.ok) setMembers((m) => ({ ...m, [g.key]: res.members }));
      else setError((e) => ({ ...e, [g.key]: res.error }));
    }
  }

  if (groups.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Medical schedule — history</h2>
      {groups.map((g, gi) => {
        const isOpen = open.has(g.key);
        return (
          <div key={g.key} className="overflow-hidden rounded-lg border">
            <button
              type="button"
              onClick={() => toggle(g)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <span className="font-semibold">{g.year}{gi === 0 ? " · latest" : ""}</span>
              <span className="text-muted-foreground">
                1st: <span className="font-medium text-foreground">{fmtD(g.visit1_date)}{g.visit1_time ? ` · ${g.visit1_time}` : ""}</span>
              </span>
              <span className="text-muted-foreground">
                2nd: <span className="font-medium text-foreground">{fmtD(g.visit2_date)}{g.visit2_time ? ` · ${g.visit2_time}` : ""}</span>
              </span>
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {g.count} {g.count === 1 ? "person" : "people"}
              </span>
            </button>
            {isOpen && (
              <div>
                {loading.has(g.key) ? (
                  <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </p>
                ) : error[g.key] ? (
                  <p className="px-3 py-3 text-sm text-destructive">{error[g.key]}</p>
                ) : members[g.key] ? (
                  <MembersTable rows={members[g.key]} />
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
