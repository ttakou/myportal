import { cn } from "@/lib/utils";

/**
 * A goal's weight, as a figure in its own right.
 *
 * The weight decides how much of the score this goal carries, which makes it
 * the most consequential number on the card — and it was set in the same small
 * grey type as the deadline and the alignment, run together after a dot. It
 * reads as filing detail rather than as the thing being agreed.
 *
 * Every goal is weighted in the same 100%, whatever its type, so the badge
 * looks the same on all of them. A goal with no weight is worth nothing at
 * all, so a zero is called out rather than shown as a quiet "0%".
 */
export function GoalWeight({
  weight,
  className,
}: {
  weight: number | null;
  className?: string;
}) {
  const value = weight ?? 0;
  const unweighted = value === 0;

  return (
    <span
      title={
        unweighted
          ? "No weight — this goal counts for nothing until it is given one."
          : `This goal carries ${value}% of the goals score.`
      }
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
        unweighted ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary",
        className,
      )}
    >
      {unweighted ? "No weight" : `${value}%`}
      {!unweighted && (
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">weight</span>
      )}
    </span>
  );
}
