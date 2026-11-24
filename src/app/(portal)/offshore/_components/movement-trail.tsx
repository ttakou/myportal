import { cn } from "@/lib/utils";
import {
  MOVE_KIND_LABEL,
  MOVE_REASON_LABEL,
  MOVE_STATUS_LABEL,
  shiftLabel,
  type MoveStatus,
} from "@/lib/offshore/movement-change";
import type { MovementRequestRow } from "@/lib/offshore/movement-requests";

const STATUS_STYLE: Record<MoveStatus, string> = {
  pending_endorsement: "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground line-through",
  expired: "bg-muted text-muted-foreground",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

/** One request with its whole trail: who asked, who endorsed, who decided, and why. */
export function MovementTrail({ r, showPerson = true }: { r: MovementRequestRow; showPerson?: boolean }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {showPerson && <span className="font-medium">{r.person}</span>}
        <span className="font-medium">{MOVE_KIND_LABEL[r.kind]}</span>
        <span className="text-muted-foreground">
          {r.scheduled_date ?? "none planned"} → <span className="font-medium text-foreground">{r.requested_date}</span> ·{" "}
          {shiftLabel(r.kind, r.scheduled_date, r.requested_date)}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])}>
          {MOVE_STATUS_LABEL[r.status]}
          {r.status === "approved" && r.applied_at ? " · done" : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {MOVE_REASON_LABEL[r.reason]}
        {r.crew ? ` · ${r.crew}` : ""}
        {r.note ? ` · “${r.note}”` : ""}
        {r.cover_note ? ` · Cover / relief: ${r.cover_note}` : ""}
      </p>
      <ul className="text-xs text-muted-foreground">
        <li>
          Raised {when(r.created_at)}
          {r.requester ? ` by ${r.requester}` : ""}
        </li>
        {r.endorsed_at && (
          <li>
            {r.status === "rejected" && r.decided_at === r.endorsed_at ? "Not endorsed" : "Endorsed"} {when(r.endorsed_at)}
            {r.endorser ? ` by ${r.endorser}` : ""}
            {r.endorse_comment ? ` — “${r.endorse_comment}”` : ""}
          </li>
        )}
        {r.decided_at && !(r.status === "rejected" && r.decided_at === r.endorsed_at) && (
          <li>
            {r.status === "approved" ? "Approved" : "Rejected"} {when(r.decided_at)}
            {r.decider ? ` by ${r.decider}` : ""}
            {r.decision_comment ? ` — “${r.decision_comment}”` : ""}
          </li>
        )}
      </ul>
    </div>
  );
}
