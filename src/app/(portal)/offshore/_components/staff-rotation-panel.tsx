"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Ship } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import type { RotationStaffOption, StaffRotationHistory } from "@/types/offshore";
import { fetchRotationStaff, fetchStaffRotation } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const STATUS_STYLE: Record<string, string> = {
  onboard: "bg-primary/10 text-primary",
  demobilised: "bg-secondary text-secondary-foreground",
  manifested: "bg-amber-100 text-amber-700",
  hse_cleared: "bg-amber-100 text-amber-700",
  requested: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive line-through",
};
const STATUS_LABEL: Record<string, string> = {
  onboard: "On board",
  demobilised: "Demobilised",
  manifested: "Manifested",
  hse_cleared: "HSE cleared",
  requested: "Requested",
  cancelled: "Cancelled",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Per-employee offshore rotation history: pick a person, see every trip. */
export function StaffRotationPanel() {
  const [pending, startTransition] = useStatusTransition("Loading…", "load");
  const [staff, setStaff] = useState<RotationStaffOption[]>([]);
  const [selected, setSelected] = useState("");
  const [history, setHistory] = useState<StaffRotationHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRotationStaff().then((res) => {
      if (res.ok) setStaff(res.staff ?? []);
      else setError(res.error ?? "Failed to load staff.");
    });
  }, []);

  function load(profileId: string) {
    setSelected(profileId);
    setHistory(null);
    if (!profileId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetchStaffRotation(profileId);
      if (!res.ok) setError(res.error ?? "Failed.");
      else setHistory(res.history ?? null);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Staff rotation history</h3>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground">Staff member</label>
        <select value={selected} onChange={(e) => load(e.target.value)} className={cn(field, "min-w-64")}>
          <option value="">Select a staff member…</option>
          {staff.map((s) => (
            <option key={s.profile_id} value={s.profile_id}>
              {s.name}{s.crew ? ` · ${s.crew}` : ""}{s.company ? ` · ${s.company}` : ""}
            </option>
          ))}
        </select>
        {pending && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      {history && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{history.person.name}</span>
            {history.summary.currentlyOnboard && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Ship className="h-3 w-3" /> On board now
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              {[history.person.crew, history.person.company, history.person.installation].filter(Boolean).join(" · ") || "—"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Trips" value={String(history.summary.trips)} />
            <Stat label="Days offshore" value={String(history.summary.totalDaysOffshore)} hint="served" />
            <Stat label="Avg trip" value={history.summary.avgTripDays == null ? "—" : `${history.summary.avgTripDays}d`} />
            <Stat label="First mobilised" value={history.summary.firstMobilise ?? "—"} />
            <Stat label="Last demobilised" value={history.summary.lastDemobilise ?? "—"} />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Mobilised</th>
                  <th className="px-3 py-2 font-medium">Demobilised</th>
                  <th className="px-3 py-2 font-medium">Installation</th>
                  <th className="px-3 py-2 text-right font-medium">Days</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.trips.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-1.5 tabular-nums">{t.mobilize_date ?? "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                      {t.demob_date ?? (t.onboard ? "— (on board)" : "—")}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{t.installation_name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.days ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[t.status] ?? "bg-muted text-muted-foreground")}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs capitalize text-muted-foreground">{t.mode}</td>
                  </tr>
                ))}
                {history.trips.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No trips recorded for this person.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
