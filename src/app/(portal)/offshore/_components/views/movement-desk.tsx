"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { MovementRequestRow } from "@/lib/offshore/movement-requests";
import { decideMovementChange, fetchMovementDesk, type MovementDeskRow } from "../../actions";
import { MovementTrail } from "../movement-trail";
import { useRun } from "./shared";

/**
 * The OIM's queue of early / late mob and demob requests: each with what it
 * does to the POB and the person's changes so far this year. The OIM decides;
 * the rest of the desk follows.
 */
export function MovementDesk() {
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState<MovementDeskRow[] | null>(null);
  const [recent, setRecent] = useState<MovementRequestRow[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [showRecent, setShowRecent] = useState(false);

  const load = () =>
    fetchMovementDesk().then((res) => {
      if (!res.ok) return;
      setOpen(res.open ?? []);
      setRecent(res.recent ?? []);
      setCanDecide(!!res.canDecide);
    });
  useEffect(() => {
    load();
  }, []);

  if (open === null) return null;

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-muted-foreground" /> Date change requests (early / late mob & demob)
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{open.length}</span>
      </h3>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">No date change waiting.</p>
      ) : (
        <div className="space-y-2">
          {open.map((r) => (
            <DeskRow key={r.id} r={r} canDecide={canDecide} pending={pending} onDecide={(ok, c) => run(() => decideMovementChange(r.id, ok, c), load)} />
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setShowRecent((v) => !v)}>
            {showRecent ? "Hide" : "Show"} the last month&apos;s decisions ({recent.length})
          </Button>
          {showRecent && (
            <div className="mt-1 divide-y rounded-lg border">
              {recent.map((r) => (
                <div key={r.id} className="p-3">
                  <MovementTrail r={r} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DeskRow({
  r,
  canDecide,
  pending,
  onDecide,
}: {
  r: MovementDeskRow;
  canDecide: boolean;
  pending: boolean;
  onDecide: (approve: boolean, comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  const frees = r.kind === "early_demob" || r.kind === "late_mob";
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <MovementTrail r={r} />
      <div className="flex flex-wrap gap-2 text-xs">
        {r.pob ? (
          <span className={cn("rounded px-2 py-0.5", r.pob.over ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
            POB peak with them: {r.pob.peak} / {r.pob.capacity}
            {r.pob.date ? ` on ${r.pob.date}` : ""}
            {r.pob.over ? " — over the limit" : ""}
          </span>
        ) : frees ? (
          <span className="rounded bg-green-50 px-2 py-0.5 text-green-700">Frees a bed for the days moved</span>
        ) : null}
        <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
          This year: {r.history.count} approved change(s){r.history.count ? `, ${r.history.days} day(s)` : ""}
        </span>
      </div>
      {canDecide ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment (required to reject)"
            className="min-w-[14rem] flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
          <Button size="sm" disabled={pending} onClick={() => onDecide(true, comment)}>
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={pending || !comment.trim()} onClick={() => onDecide(false, comment)}>
            Reject
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">The OIM decides.</p>
      )}
    </div>
  );
}
