"use client";

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ROTATION_FLAG_KIND_LABEL,
  ROTATION_FLAG_REASON_LABEL,
  type Installation,
  type RotationFlag,
  type RotationFlagKind,
  type RotationFlagReason,
  type RotationStaffOption,
} from "@/types/offshore";
import { addRotationFlag, fetchRotationFlags, fetchRotationStaff, resolveRotationFlag } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const KINDS = Object.keys(ROTATION_FLAG_KIND_LABEL) as RotationFlagKind[];
const REASONS = Object.keys(ROTATION_FLAG_REASON_LABEL) as RotationFlagReason[];

const KIND_STYLE: Record<RotationFlagKind, string> = {
  absent: "bg-destructive/10 text-destructive",
  early_departure: "bg-amber-100 text-amber-700",
  early_arrival: "bg-blue-100 text-blue-700",
  late_arrival: "bg-amber-100 text-amber-700",
};

/**
 * Attendance / rotation exceptions: flag early comers & leavers and absentees
 * with a reason (sick leave, medevac…), and clear them once dealt with.
 */
export function AttendancePanel({ installations }: { installations: Installation[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…", "save");
  const [staff, setStaff] = useState<RotationStaffOption[]>([]);
  const [flags, setFlags] = useState<RotationFlag[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [profileId, setProfileId] = useState("");
  const [kind, setKind] = useState<RotationFlagKind>("absent");
  const [reason, setReason] = useState<RotationFlagReason>("sick");
  const [installationId, setInstallationId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  function reload() {
    fetchRotationFlags().then((res) => {
      if (res.ok) setFlags(res.flags ?? []);
      else setError(res.error ?? "Failed to load flags.");
    });
  }
  useEffect(() => {
    fetchRotationStaff().then((res) => res.ok && setStaff(res.staff ?? []));
    reload();
  }, []);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addRotationFlag({
        profileId,
        installationId: installationId || undefined,
        kind,
        reason,
        note: note || undefined,
        effectiveDate: date,
      });
      if (!res.ok) setError(res.error ?? "Failed.");
      else {
        setProfileId("");
        setNote("");
        reload();
      }
    });
  }
  function resolve(id: string, remove: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await resolveRotationFlag(id, remove);
      if (!res.ok) setError(res.error ?? "Failed.");
      else reload();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <UserX className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Attendance flags</h3>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {/* Add a flag */}
      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-sm font-medium">Flag an early comer / leaver or absentee</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={field} aria-label="Staff member">
            <option value="">Staff member…</option>
            {staff.map((s) => (
              <option key={s.profile_id} value={s.profile_id}>
                {s.name}{s.crew ? ` · ${s.crew}` : ""}
              </option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as RotationFlagKind)} className={field} aria-label="What happened">
            {KINDS.map((k) => (
              <option key={k} value={k}>{ROTATION_FLAG_KIND_LABEL[k]}</option>
            ))}
          </select>
          <select value={reason} onChange={(e) => setReason(e.target.value as RotationFlagReason)} className={field} aria-label="Reason">
            {REASONS.map((r) => (
              <option key={r} value={r}>{ROTATION_FLAG_REASON_LABEL[r]}</option>
            ))}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Effective date" />
          <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className={field} aria-label="Installation">
            <option value="">Installation (optional)</option>
            {installations.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={field} />
        </div>
        <div className="mt-2">
          <Button size="sm" disabled={pending || !profileId} onClick={add}>Add flag</Button>
        </div>
      </div>

      {/* Active flags */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Staff</th>
              <th className="px-3 py-2 font-medium">Flag</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {flags.map((f) => (
              <tr key={f.id}>
                <td className="px-3 py-1.5 font-medium">{f.name}</td>
                <td className="px-3 py-1.5">
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", KIND_STYLE[f.kind])}>
                    {ROTATION_FLAG_KIND_LABEL[f.kind]}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{ROTATION_FLAG_REASON_LABEL[f.reason]}</td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{f.effective_date}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{f.note ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <div className="flex justify-end gap-2">
                    <button type="button" disabled={pending} onClick={() => resolve(f.id, false)} className="text-xs font-medium text-primary hover:underline">
                      Resolve
                    </button>
                    <button type="button" disabled={pending} onClick={() => resolve(f.id, true)} className="text-xs text-muted-foreground hover:text-destructive">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {flags.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No active attendance flags.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
