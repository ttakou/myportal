"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Pencil, Search, UserPlus, Users } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_LABEL,
  type AttendanceStatus,
  type StaffAttendance,
} from "@/types/staff-attendance";
import { VEHICLE_TYPES } from "@/types/visitors";
import { registerStaffAtGate, setStaffCheckInAt, setStaffCheckOutAt, staffCheckIn, staffCheckOut } from "../staff-actions";

const field = "rounded-md border bg-background px-2 py-1 text-sm";

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
  // The row whose gate check-in form is open, plus its vehicle + comment entry.
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState("");
  const [plate, setPlate] = useState("");
  const [comment, setComment] = useState("");
  // Optional arrival time on check-in (blank = now).
  const [arrival, setArrival] = useState("");
  // The row whose check-out form is open (captures an optional comment).
  const [checkOutId, setCheckOutId] = useState<string | null>(null);
  // The row whose recorded arrival time is being corrected.
  const [editTimeId, setEditTimeId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  // The row whose recorded departure time is being corrected.
  const [editOutId, setEditOutId] = useState<string | null>(null);
  const [editOut, setEditOut] = useState("");
  // Register a walk-in staff member / contractor not yet in the system.
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regType, setRegType] = useState<"employee" | "contractor">("employee");
  const [regDept, setRegDept] = useState("");
  const [regEmpNum, setRegEmpNum] = useState("");
  const [regEmail, setRegEmail] = useState("");

  function registerStaff() {
    run(async () => {
      const res = await registerStaffAtGate({
        fullName: regName,
        employeeType: regType,
        department: regDept || undefined,
        empNum: regEmpNum || undefined,
        email: regEmail || undefined,
      });
      if (res.ok) {
        setRegName("");
        setRegDept("");
        setRegEmpNum("");
        setRegEmail("");
        setRegType("employee");
        setShowRegister(false);
      }
      return res;
    });
  }

  function openCheckIn(id: string) {
    setCheckOutId(null);
    setEditTimeId(null);
    setCheckInId(id);
    setVehicleType("");
    setPlate("");
    setComment("");
    setArrival("");
  }
  function confirmCheckIn(id: string) {
    const vehicle =
      vehicleType.trim() || plate.trim()
        ? { type: vehicleType.trim() || null, plate: plate.trim() || null }
        : undefined;
    run(() => staffCheckIn(id, vehicle, comment.trim() || null, arrival ? new Date(arrival).toISOString() : null));
    setCheckInId(null);
  }
  function openEditTime(id: string, currentIso: string | null) {
    setCheckInId(null);
    setCheckOutId(null);
    setEditTimeId(id);
    setEditTime(
      currentIso
        ? new Date(new Date(currentIso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        : "",
    );
  }
  function confirmEditTime(id: string) {
    if (!editTime) return;
    run(() => setStaffCheckInAt(id, new Date(editTime).toISOString()));
    setEditTimeId(null);
  }
  function openEditOut(id: string, currentIso: string | null) {
    setCheckInId(null);
    setCheckOutId(null);
    setEditTimeId(null);
    setEditOutId(id);
    setEditOut(
      currentIso
        ? new Date(new Date(currentIso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        : "",
    );
  }
  function confirmEditOut(id: string) {
    if (!editOut) return;
    run(() => setStaffCheckOutAt(id, new Date(editOut).toISOString()));
    setEditOutId(null);
  }
  function openCheckOut(id: string) {
    setCheckInId(null);
    setCheckOutId(id);
    setComment("");
  }
  function confirmCheckOut(id: string) {
    run(() => staffCheckOut(id, comment.trim() || null));
    setCheckOutId(null);
  }

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

  const { count, hasMore, remaining, showMore, sentinelRef } = useProgressiveReveal(
    visible.length,
    { resetKey: query },
  );

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
          <button
            type="button"
            onClick={() => setShowRegister((s) => !s)}
            className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <UserPlus className="h-4 w-4" /> Register a staff / contractor
          </button>
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

      {showRegister && (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-sm font-medium">Register a staff member or contractor not yet in the system</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="Full name"
              className={field}
            />
            <select
              value={regType}
              onChange={(e) => setRegType(e.target.value as "employee" | "contractor")}
              aria-label="Type"
              className={field}
            >
              <option value="employee">Employee</option>
              <option value="contractor">Contractor</option>
            </select>
            <input value={regDept} onChange={(e) => setRegDept(e.target.value)} placeholder="Department (optional)" className={field} />
            <input value={regEmpNum} onChange={(e) => setRegEmpNum(e.target.value)} placeholder="Employee # (optional)" className={field} />
            <input value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="Work email (optional)" className={field} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" disabled={pending || !regName.trim()} onClick={registerStaff}>
              Register
            </Button>
            <span className="text-xs text-muted-foreground">
              Creates a basic record only — no app role or access is granted here.
            </span>
          </div>
        </div>
      )}

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
              <th className="px-4 py-3 font-medium">Vehicle</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.slice(0, count).map((s) => (
              <tr key={s.profile_id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.job_title, s.department].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {s.check_in_comment && (
                    <p className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
                      <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>In: {s.check_in_comment}</span>
                    </p>
                  )}
                  {s.check_out_comment && (
                    <p className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
                      <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>Out: {s.check_out_comment}</span>
                    </p>
                  )}
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
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {editTimeId === s.profile_id ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="datetime-local"
                        value={editTime}
                        max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                        onChange={(e) => setEditTime(e.target.value)}
                        aria-label="Arrival time"
                        className={cn(field, "w-44")}
                      />
                      <button type="button" disabled={pending || !editTime} onClick={() => confirmEditTime(s.profile_id)} className="text-xs font-medium text-primary hover:underline">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditTimeId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {time(s.check_in_at)}
                      {s.check_in_at && (
                        <button
                          type="button"
                          onClick={() => openEditTime(s.profile_id, s.check_in_at)}
                          title="Edit arrival time"
                          className="text-muted-foreground/70 hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {editOutId === s.profile_id ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="datetime-local"
                        value={editOut}
                        min={s.check_in_at ? new Date(new Date(s.check_in_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : undefined}
                        max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                        onChange={(e) => setEditOut(e.target.value)}
                        aria-label="Departure time"
                        className={cn(field, "w-44")}
                      />
                      <button type="button" disabled={pending || !editOut} onClick={() => confirmEditOut(s.profile_id)} className="text-xs font-medium text-primary hover:underline">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditOutId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {time(s.check_out_at)}
                      {s.check_out_at && (
                        <button
                          type="button"
                          onClick={() => openEditOut(s.profile_id, s.check_out_at)}
                          title="Edit departure time"
                          className="text-muted-foreground/70 hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[s.vehicle_type, s.vehicle_plate].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {checkOutId === s.profile_id ? (
                      <>
                        <input
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Comment (optional)"
                          aria-label="Check-out comment"
                          className={cn(field, "w-40")}
                        />
                        <Button size="sm" disabled={pending} onClick={() => confirmCheckOut(s.profile_id)}>
                          Confirm
                        </Button>
                        <button
                          type="button"
                          onClick={() => setCheckOutId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </>
                    ) : s.status === "on_site" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => openCheckOut(s.profile_id)}
                      >
                        Check out
                      </Button>
                    ) : checkInId === s.profile_id ? (
                      <>
                        <select
                          value={vehicleType}
                          onChange={(e) => setVehicleType(e.target.value)}
                          aria-label="Vehicle type"
                          className={field}
                        >
                          <option value="">No vehicle</option>
                          {VEHICLE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <input
                          value={plate}
                          onChange={(e) => setPlate(e.target.value)}
                          placeholder="Plate"
                          aria-label="Vehicle plate"
                          className={cn(field, "w-24")}
                        />
                        <input
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Comment (optional)"
                          aria-label="Check-in comment"
                          className={cn(field, "w-40")}
                        />
                        <input
                          type="datetime-local"
                          value={arrival}
                          max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                          onChange={(e) => setArrival(e.target.value)}
                          aria-label="Arrival time (blank = now)"
                          title="Arrival time — leave blank for now"
                          className={field}
                        />
                        <Button size="sm" disabled={pending} onClick={() => confirmCheckIn(s.profile_id)}>
                          Confirm
                        </Button>
                        <button
                          type="button"
                          onClick={() => setCheckInId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <Button size="sm" disabled={pending} onClick={() => openCheckIn(s.profile_id)}>
                        Check in
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {query ? "No staff match your search." : "No active staff."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMore
        ref={sentinelRef}
        hasMore={hasMore}
        remaining={remaining}
        onClick={showMore}
        label="Show more staff"
      />
    </section>
  );
}
