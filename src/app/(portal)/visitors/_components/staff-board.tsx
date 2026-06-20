"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_LABEL,
  type AttendanceStatus,
  type StaffAttendance,
} from "@/types/staff-attendance";
import { staffCheckIn, staffCheckOut } from "../staff-actions";

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  on_site: "bg-primary/10 text-primary",
  left: "bg-secondary text-secondary-foreground",
  away: "bg-muted text-muted-foreground",
};

// On site first, then not-yet-in, then those who have left; alpha within each.
const STATUS_ORDER: Record<AttendanceStatus, number> = { on_site: 0, away: 1, left: 2 };

function time(ts: string | null): string {
  return ts ? new Date(ts).toLocaleTimeString() : "—";
}

export function StaffBoard({ rows }: { rows: StaffAttendance[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const onSiteCount = rows.filter((r) => r.status === "on_site").length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.full_name.toLowerCase().includes(q) ||
            (r.department ?? "").toLowerCase().includes(q) ||
            (r.job_title ?? "").toLowerCase().includes(q),
        )
      : rows;
    return [...filtered].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.full_name.localeCompare(b.full_name),
    );
  }, [rows, query]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-primary" /> Staff on site
          </h2>
          <p className="text-sm text-muted-foreground">
            {onSiteCount} of {rows.length} staff currently on site. Check staff in or out at the gate.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search staff…"
            className="w-56 rounded-md border bg-background py-2 pl-8 pr-3 text-sm"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Check in</th>
              <th className="px-4 py-3 font-medium">Check out</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((s) => (
              <tr key={s.profile_id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.job_title, s.department].filter(Boolean).join(" · ") || "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
                      STATUS_STYLE[s.status],
                    )}
                  >
                    {ATTENDANCE_LABEL[s.status]}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{time(s.check_in_at)}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{time(s.check_out_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    {s.status === "on_site" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => staffCheckOut(s.profile_id))}
                      >
                        Check out
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => staffCheckIn(s.profile_id))}
                      >
                        Check in
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {query ? "No staff match your search." : "No active staff."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
