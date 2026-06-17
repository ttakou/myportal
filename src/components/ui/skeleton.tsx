import { cn } from "@/lib/utils";

/**
 * Low-level shimmer block used to build route loading skeletons. Renders a
 * muted, pulsing placeholder; size/shape come from the passed className.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
