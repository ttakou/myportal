import Link from "next/link";
import { AlertTriangle, Anchor, LifeBuoy, Ship, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOARD_GROUPINGS,
  boardSummary,
  filterRows,
  groupRows,
  isException,
  KIND_LABEL,
  type BoardFilter,
  type BoardGrouping,
  type BoardRow,
} from "@/lib/offshore/where-board";

const KIND_TONE: Record<BoardRow["kind"], string> = {
  offshore: "bg-green-50 text-green-800 border-green-200",
  onshore: "bg-muted text-muted-foreground border-border",
  due_offshore: "bg-amber-50 text-amber-800 border-amber-200",
  overdue_off: "bg-amber-50 text-amber-800 border-amber-200",
  off_early: "bg-amber-50 text-amber-800 border-amber-200",
  no_schedule: "bg-muted text-muted-foreground border-border",
};

const href = (by: BoardGrouping, only: BoardFilter) =>
  `/offshore?view=whereis&by=${by}${only === "all" ? "" : `&only=${only}`}`;

/**
 * The whole roster, the way the card shows one person: who the schedule puts
 * offshore, who the record has on board, where each musters and sleeps.
 * Server-rendered; the grouping and filter live in the URL so the OIM can
 * bookmark "on board by muster station".
 */
export function WhereIsBoard({
  rows,
  by,
  only,
}: {
  rows: BoardRow[];
  by: BoardGrouping;
  only: BoardFilter;
}) {
  const s = boardSummary(rows);
  const shown = filterRows(rows, only);
  const groups = groupRows(shown, by);
  const exceptions = s.dueOffshore + s.overdueOff + s.offEarly;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<Ship className="h-4 w-4" />}
          label="On board (recorded)"
          value={s.onBoard}
          sub={`${s.scheduledOffshore} scheduled offshore today`}
          tone={s.onBoard === s.scheduledOffshore ? "green" : "amber"}
        />
        <Tile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Record disagrees with schedule"
          value={exceptions}
          sub={
            exceptions
              ? [
                  s.dueOffshore && `${s.dueOffshore} due offshore`,
                  s.overdueOff && `${s.overdueOff} overdue off`,
                  s.offEarly && `${s.offEarly} off early`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Everyone is where the schedule says"
          }
          tone={exceptions ? "amber" : "green"}
        />
        <Tile
          icon={<LifeBuoy className="h-4 w-4" />}
          label="On board, no muster station"
          value={s.onBoardNoLifeboat}
          sub={s.onBoardNoLifeboat ? "A roll-call cannot place them" : "Every person on board has a station"}
          tone={s.onBoardNoLifeboat ? "red" : "green"}
        />
        <Tile
          icon={<Users className="h-4 w-4" />}
          label="On the roster"
          value={s.total}
          sub={s.noSchedule ? `${s.noSchedule} with no schedule` : "All on a rotation"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Group</span>
        <nav className="inline-flex overflow-hidden rounded-md border text-xs" aria-label="Group by">
          {BOARD_GROUPINGS.map((g, i) => (
            <Link
              key={g.key}
              href={href(g.key, only)}
              aria-current={g.key === by ? "page" : undefined}
              className={cn(
                "px-3 py-1.5",
                i > 0 && "border-l",
                g.key === by ? "bg-primary font-medium text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {g.label}
            </Link>
          ))}
        </nav>
        <span className="ml-2 text-muted-foreground">Show</span>
        <nav className="inline-flex overflow-hidden rounded-md border text-xs" aria-label="Filter">
          {(
            [
              ["all", "Everyone"],
              ["onboard", "On board"],
              ["exceptions", "Exceptions"],
            ] as [BoardFilter, string][]
          ).map(([key, label], i) => (
            <Link
              key={key}
              href={href(by, key)}
              aria-current={key === only ? "page" : undefined}
              className={cn(
                "px-3 py-1.5",
                i > 0 && "border-l",
                key === only ? "bg-primary font-medium text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted-foreground">
          {shown.length} of {s.total} shown
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Nobody matches.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.key} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  {by === "lifeboat" ? <LifeBuoy className="h-4 w-4 text-muted-foreground" /> : by === "crew" ? <Users className="h-4 w-4 text-muted-foreground" /> : <Anchor className="h-4 w-4 text-muted-foreground" />}
                  {g.key}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.onBoard} on board · {g.rows.length} {g.rows.length === 1 ? "person" : "people"}
                </span>
              </div>
              <ul className="divide-y text-sm">
                {g.rows.map((r) => (
                  <li key={r.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5", isException(r.kind) && "bg-amber-50/60")}>
                    <Link href={`/offshore?view=whereis&person=${r.id}`} className="min-w-0 font-medium hover:underline">
                      {r.name}
                    </Link>
                    <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-medium", KIND_TONE[r.kind])}>
                      {r.onBoard && r.kind !== "offshore" && r.kind !== "overdue_off" ? "On board · " : ""}
                      {KIND_LABEL[r.kind]}
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      {by !== "crew" && r.crew && <span>{r.crew}</span>}
                      {by !== "lifeboat" && <span>{r.lifeboat ?? "no station"}</span>}
                      {by !== "cabin" && <span>{r.bed ?? "no bed"}{r.bedSource === "trip" ? "" : r.bed ? " (default)" : ""}</span>}
                      {by === "cabin" && r.bed && <span>{r.bed.split(" · ")[1] ?? ""}</span>}
                      {r.nextChange && (
                        <span>
                          {r.kind === "offshore" || r.kind === "due_offshore" || r.kind === "off_early" ? "off" : "out"} {r.nextChange}
                          {r.daysToChange != null ? ` (${r.daysToChange}d)` : ""}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone?: "green" | "amber" | "red";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        tone === "amber" && "border-amber-200 bg-amber-50/60",
        tone === "red" && "border-red-200 bg-red-50/60",
        tone === "green" && "border-green-200 bg-green-50/40",
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
