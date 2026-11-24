import { ArrowLeftRight, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, sheetGroup, type SheetGroup, type SheetMovement } from "@/lib/offshore/meal-sheet";

/**
 * How arrivals and leavers stand out on the meal sheet: one colour each,
 * used for the badge, the group heading and the row's left edge (an edge
 * still prints when the browser drops background colours).
 */
export const MOVEMENT_STYLE: Record<SheetMovement, { badge: string; edge: string; heading: string }> = {
  arrival: {
    badge: "border-green-300 bg-green-50 text-green-800",
    edge: "border-l-4 border-l-green-500",
    heading: "bg-green-50 text-green-900",
  },
  departure: {
    badge: "border-orange-300 bg-orange-50 text-orange-800",
    edge: "border-l-4 border-l-orange-500",
    heading: "bg-orange-50 text-orange-900",
  },
  day: {
    badge: "border-sky-300 bg-sky-50 text-sky-800",
    edge: "border-l-4 border-l-sky-500",
    heading: "bg-sky-50 text-sky-900",
  },
};

const ICON: Record<SheetMovement, typeof LogIn> = { arrival: LogIn, departure: LogOut, day: ArrowLeftRight };
const SHORT: Record<SheetMovement, string> = { arrival: "Arriving · MOB", departure: "Leaving · DEMOB", day: "In and out" };

export function MovementBadge({ movement, className }: { movement: SheetMovement | null | undefined; className?: string }) {
  if (!movement) return null;
  const Icon = ICON[movement];
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex items-center gap-0.5 rounded border px-1 text-[10px] font-semibold uppercase tracking-wide",
        MOVEMENT_STYLE[movement].badge,
        className,
      )}
    >
      <Icon className="h-3 w-3" /> {SHORT[movement]}
    </span>
  );
}

export const rowEdge = (movement: SheetMovement | null | undefined) => (movement ? MOVEMENT_STYLE[movement].edge : "");

/** Heading text and style of a group, with its head count. */
export function groupHeading(group: SheetGroup, count: number) {
  const style = group === "arrival" || group === "departure" || group === "day" ? MOVEMENT_STYLE[group].heading : "bg-muted/60 text-muted-foreground";
  const hint =
    group === "arrival"
      ? " — snack, lunch, dinner and a bed"
      : group === "departure"
        ? " — breakfast, snack and lunch; no dinner or bed"
        : group === "day"
          ? " — snack and lunch"
          : "";
  return { text: `${GROUP_LABEL[group]} · ${count}${hint}`, className: style };
}

/** Group sizes, and whether the sheet has more than one group (headings are then worth showing). */
export function groupCounts(rows: { category: string; movement?: string | null }[]) {
  const counts = new Map<SheetGroup, number>();
  for (const r of rows) counts.set(sheetGroup(r), (counts.get(sheetGroup(r)) ?? 0) + 1);
  return { counts, grouped: counts.size > 1 };
}
