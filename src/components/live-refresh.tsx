"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Keeps the (server-rendered) command center current by periodically calling
 * router.refresh(), which re-runs the page's server fetches in place without a
 * full reload. Polling pauses while the tab is hidden and fires immediately on
 * refocus, so an idle background tab doesn't hammer the server. Also offers a
 * manual refresh and shows how stale the data is.
 */
export function LiveRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState(() => Date.now());
  const [, setTick] = useState(0);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
    setLastUpdated(Date.now());
  }, [router]);

  // Poll on an interval, but only while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, refresh]);

  // Re-render every second so the "updated Ns ago" label stays accurate.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000));
  const ago =
    isPending || secs < 2
      ? "updating…"
      : secs < 60
        ? `updated ${secs}s ago`
        : `updated ${Math.floor(secs / 60)}m ago`;

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={isPending}
      title="Refresh now"
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-70"
    >
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full bg-green-500",
            isPending ? "animate-ping opacity-75" : "opacity-0",
          )}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="hidden sm:inline">Live</span>
      <span className="text-xs font-normal text-muted-foreground">{ago}</span>
      <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
    </button>
  );
}
