"use client";

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global activity indicator.
 *
 * One consistent, blinking status pill that tells the user the app is busy and
 * *why* — "Loading…" while a page is navigating, "Saving…" (or a verb that fits
 * the situation) while a record is being written. Navigation feedback is fully
 * automatic; mutations opt in via the `useStatusTransition` drop-in for
 * `useTransition`, so every save reads the same way.
 */

type ActivityKind = "nav" | "save" | "load";

interface Activity {
  id: number;
  kind: ActivityKind;
  message: string;
}

interface ActivityApi {
  start: (message: string, kind?: ActivityKind) => number;
  stop: (id: number) => void;
}

const ActivityContext = createContext<ActivityApi | null>(null);

export function useActivity(): ActivityApi {
  const ctx = useContext(ActivityContext);
  if (!ctx) {
    // Safe no-op when used outside the provider (e.g. isolated unit tests).
    return { start: () => 0, stop: () => {} };
  }
  return ctx;
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Activity[]>([]);
  const nextId = useRef(1);

  const start = useCallback((message: string, kind: ActivityKind = "load") => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, kind, message }]);
    return id;
  }, []);

  const stop = useCallback((id: number) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const api = useMemo<ActivityApi>(() => ({ start, stop }), [start, stop]);

  // Show the most recently started activity; saves outrank background loads.
  const current =
    items.find((a) => a.kind === "save") ?? items[items.length - 1] ?? null;

  return (
    <ActivityContext.Provider value={api}>
      {children}
      <Suspense fallback={null}>
        <RouteActivity start={start} stop={stop} />
      </Suspense>
      <ActivityBanner activity={current} />
    </ActivityContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Automatic navigation feedback
// ---------------------------------------------------------------------------
function RouteActivity({
  start,
  stop,
}: {
  start: ActivityApi["start"];
  stop: ActivityApi["stop"];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navId = useRef<number | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNav = useCallback(() => {
    if (navId.current !== null) {
      stop(navId.current);
      navId.current = null;
    }
    if (safety.current) {
      clearTimeout(safety.current);
      safety.current = null;
    }
  }, [stop]);

  // A same-origin link click means a navigation is starting — show "Loading…".
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.hasAttribute("download")) return;
      const t = anchor.getAttribute("target");
      if (t && t !== "_self") return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same page (or hash on the same page) — nothing to wait for.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      if (navId.current === null) navId.current = start("Loading…", "nav");
      // Safety net: never let the indicator get stuck if navigation is aborted.
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(clearNav, 10000);
    }

    // Capture phase: runs before Next's <Link> handler calls preventDefault.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start, clearNav]);

  // The route (path or query) actually changed → navigation finished.
  useEffect(() => {
    clearNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}

// ---------------------------------------------------------------------------
// Drop-in replacement for useTransition that announces "Saving…" globally
// ---------------------------------------------------------------------------
/**
 * Same shape as React's `useTransition`, but while the transition is pending it
 * surfaces a global status message. Swap `useTransition()` for
 * `useStatusTransition()` (optionally with a situation-specific verb such as
 * "Submitting…" or "Deleting…") and every mutation gets consistent feedback.
 */
export function useStatusTransition(
  message = "Saving…",
  kind: Exclude<ActivityKind, "nav"> = "save",
): [boolean, React.TransitionStartFunction] {
  const [isPending, startTransition] = useTransition();
  const { start, stop } = useActivity();
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPending && idRef.current === null) {
      idRef.current = start(message, kind);
    } else if (!isPending && idRef.current !== null) {
      stop(idRef.current);
      idRef.current = null;
    }
  }, [isPending, message, kind, start, stop]);

  // Clean up if the component unmounts mid-transition.
  useEffect(() => {
    return () => {
      if (idRef.current !== null) stop(idRef.current);
    };
  }, [stop]);

  return [isPending, startTransition];
}

// ---------------------------------------------------------------------------
// The pill
// ---------------------------------------------------------------------------
const DOT: Record<ActivityKind, string> = {
  nav: "bg-primary",
  save: "bg-amber-500",
  load: "bg-primary",
};

function ActivityBanner({ activity }: { activity: Activity | null }) {
  // Keep the last message during the fade-out so the text doesn't blank first.
  const [shown, setShown] = useState<Activity | null>(null);
  useEffect(() => {
    if (activity) setShown(activity);
  }, [activity]);

  const visible = activity !== null;
  const a = activity ?? shown;
  if (!a) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 top-3 z-[100] flex justify-center transition-all duration-200 ${
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-2 opacity-0"
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/95 px-4 py-1.5 text-sm font-medium text-card-foreground shadow-lg backdrop-blur">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${DOT[a.kind]}`}
          />
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT[a.kind]}`}
          />
        </span>
        <span className="animate-pulse">{a.message}</span>
      </div>
    </div>
  );
}
