import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic page loading skeleton: a title block, a row of stat cards and a list
 * panel. Used as the Suspense fallback for portal route segments so navigation
 * paints an instant layout instead of a blank/frozen screen while server data
 * loads. Variants tune the shape for table- vs form-heavy modules.
 */
export function PageSkeleton({
  variant = "default",
}: {
  variant?: "default" | "table" | "form";
}) {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      {/* Title */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {variant !== "form" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      {variant === "form" ? (
        <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-32" />
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
