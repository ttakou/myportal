import { PageSkeleton } from "@/components/ui/page-skeleton";

/**
 * Fallback shown during navigation to any portal page (inherited by every
 * segment that doesn't define its own loading.tsx). Turns a blank, frozen
 * post-click wait into an instant skeleton while server data streams in.
 */
export default function Loading() {
  return <PageSkeleton />;
}
