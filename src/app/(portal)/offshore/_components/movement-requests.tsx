"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkMove,
  isOpen,
  MOVE_KIND_LABEL,
  MOVE_KINDS,
  MOVE_REASON_LABEL,
  MOVE_REASONS,
  moveDirection,
  scheduledFor,
  shiftLabel,
  type MoveKind,
  type MoveReason,
  type PersonMovements,
} from "@/lib/offshore/movement-change";
import type { MovementRequestRow } from "@/lib/offshore/movement-requests";
import {
  endorseMovementChange,
  fetchMovementPanel,
  fetchPersonMovements,
  requestMovementChange,
  withdrawMovementChange,
  type MovementPanel,
} from "../actions";
import { MovementTrail } from "./movement-trail";
import { useRun } from "./views/shared";

const field = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Early / late mobilisation and demobilisation requests, for the staff member
 * themselves, their line manager and the offshore desk: raise one, endorse
 * one for your team, and follow every request you are part of.
 */
export function MovementRequests() {
  const { pending, error, run } = useRun();
  const [panel, setPanel] = useState<MovementPanel | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = () =>
    fetchMovementPanel().then((res) => {
      if (res.ok && res.panel) setPanel(res.panel);
    });
  useEffect(() => {
    load();
  }, []);

  if (!panel) return null;
  const history = showAll ? panel.mine : panel.mine.slice(0, 3);

  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarClock className="h-5 w-5 text-primary" /> Change my mob / demob dates
      </h2>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {panel.toEndorse.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
          <h3 className="text-sm font-semibold text-amber-900">Waiting for your endorsement ({panel.toEndorse.length})</h3>
          {panel.toEndorse.map((r) => (
            <EndorseRow key={r.id} r={r} pending={pending} onDecide={(ok, c) => run(() => endorseMovementChange(r.id, ok, c), load)} />
          ))}
        </div>
      )}

      <RequestForm panel={panel} pending={pending} run={run} onDone={load} />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">My requests</h3>
        {panel.mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">No date change requested yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {history.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <MovementTrail r={r} showPerson={false} />
                {isOpen(r.status) && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => withdrawMovementChange(r.id), load)}>
                    Withdraw
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {panel.mine.length > 3 && (
          <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show the latest 3 only" : `Show all ${panel.mine.length}`}
          </Button>
        )}
      </div>

      {panel.raised.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Requests I raised for others</h3>
          <div className="divide-y rounded-lg border">
            {panel.raised.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <MovementTrail r={r} />
                {isOpen(r.status) && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => withdrawMovementChange(r.id), load)}>
                    Withdraw
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function EndorseRow({ r, pending, onDecide }: { r: MovementRequestRow; pending: boolean; onDecide: (endorse: boolean, comment: string) => void }) {
  const [comment, setComment] = useState("");
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <MovementTrail r={r} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment (required to turn it down)"
          className="min-w-[14rem] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
        />
        <Button size="sm" disabled={pending} onClick={() => onDecide(true, comment)}>
          Endorse → OIM
        </Button>
        <Button size="sm" variant="outline" disabled={pending || !comment.trim()} onClick={() => onDecide(false, comment)}>
          Turn down
        </Button>
      </div>
    </div>
  );
}

function RequestForm({
  panel,
  pending,
  run,
  onDone,
}: {
  panel: MovementPanel;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
  onDone: () => void;
}) {
  const [who, setWho] = useState(panel.me);
  const [movements, setMovements] = useState<PersonMovements | null>(null);
  const [crewName, setCrewName] = useState<string | null>(null);
  const [open, setOpen] = useState<MoveKind[]>([]);
  const [kind, setKind] = useState<MoveKind>("late_demob");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState<MoveReason>("operational");
  const [note, setNote] = useState("");
  const [cover, setCover] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setMovements(null);
    fetchPersonMovements(who).then((res) => {
      if (!live) return;
      if (res.ok) {
        setMovements(res.movements ?? null);
        setCrewName(res.crewName ?? null);
        setOpen(res.open ?? []);
        setLoadError(null);
        // Someone on board can only move their demobilisation.
        if (res.movements?.aboard) setKind((k) => (moveDirection(k) === "out" ? "late_demob" : k));
      } else setLoadError(res.error ?? "Could not load the schedule.");
    });
    return () => {
      live = false;
    };
  }, [who]);

  const today = new Date().toISOString().slice(0, 10);
  const scheduled = movements ? scheduledFor(kind, movements) : null;
  const blocked = open.some((k) => moveDirection(k) === moveDirection(kind));
  const problem = movements && date ? checkMove({ kind, movements, requested: date, todayIso: today }) : null;
  const self = who === panel.me;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => requestMovementChange({ profileId: who, kind, requestedDate: date, reason, note, coverNote: cover }),
          () => {
            setDate("");
            setNote("");
            setCover("");
            onDone();
            fetchPersonMovements(who).then((res) => res.ok && setOpen(res.open ?? []));
          },
        );
      }}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {panel.groups.length > 0 && (
          <label className="text-xs text-muted-foreground">
            For
            <select value={who} onChange={(e) => setWho(e.target.value)} className={field}>
              <option value={panel.me}>Myself</option>
              {panel.groups.map((g) => (
                <optgroup key={g.label} label={`${g.label} (${g.people.length})`}>
                  {g.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-muted-foreground">
          Change
          <select value={kind} onChange={(e) => setKind(e.target.value as MoveKind)} className={field}>
            {MOVE_KINDS.filter((k) => !(movements?.aboard && moveDirection(k) === "out")).map((k) => (
              <option key={k} value={k}>
                {MOVE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Scheduled
          <input value={scheduled ?? "—"} readOnly className={`${field} bg-muted/40`} />
        </label>
        <label className="text-xs text-muted-foreground">
          Requested date
          <input type="date" required value={date} min={today} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-muted-foreground">
          Reason
          <select value={reason} onChange={(e) => setReason(e.target.value as MoveReason)} className={field}>
            {MOVE_REASONS.map((r) => (
              <option key={r} value={r}>
                {MOVE_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
          {kind === "early_demob" || kind === "late_mob" ? "Who covers the post meanwhile" : "Reliever / back-to-back affected"}
          <input value={cover} onChange={(e) => setCover(e.target.value)} maxLength={200} className={field} />
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">
        Details
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What the OIM needs to know" className={field} />
      </label>

      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {movements && !scheduled && (
        <p className="text-xs text-muted-foreground">
          {movements.aboard ? "On board: only the demobilisation can be moved." : "No scheduled movement to change."}
        </p>
      )}
      {blocked && <p className="text-xs text-amber-700">There is already an open change for this movement.</p>}
      {problem && <p className="text-xs text-destructive">{problem}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {crewName ? `${crewName} · ` : ""}
          {scheduled && date && !problem ? `${shiftLabel(kind, scheduled, date)} · ` : ""}
          {self
            ? "Goes to your line manager (if you have one), then the OIM. Only this hitch moves; your rotation stays the same."
            : "Goes straight to the OIM. Only this hitch moves; the rotation stays the same."}
        </p>
        <Button type="submit" disabled={pending || !scheduled || !date || !!problem || blocked}>
          Send request
        </Button>
      </div>
    </form>
  );
}
