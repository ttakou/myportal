"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoReconcileAttendance, selfCheckOut } from "@/app/(portal)/visitors/staff-actions";

const INTERVAL_MS = 30 * 60 * 1000; // re-check every 30 minutes while the app is open

function getLocation(timeout = 10000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: 60_000 },
    );
  });
}

/** Only run the silent auto-check when location is already granted — we never
 *  pop a permission prompt on our own (the manual "I'm in" button does that).
 *  Falls back to a flag set after a successful manual check-in, because Safari /
 *  iOS doesn't support the Permissions API for geolocation. */
async function locationGranted(): Promise<boolean> {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("geo-granted") === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    if (!navigator.permissions?.query) return false;
    const s = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return s.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Background-ish geofence attendance: while the portal is open, every ~30 min
 * (and on open/resume) it reads the user's location and reconciles attendance —
 * auto-checking-in at the base, and flagging "looks like you've left" (never an
 * automatic check-out) when they drift out of range. Renders nothing until it
 * has something to show.
 */
export function AutoAttendance() {
  const router = useRouter();
  const [leftPrompt, setLeftPrompt] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    if (!(await locationGranted())) return;
    busy.current = true;
    try {
      const coords = await getLocation();
      const res = await autoReconcileAttendance(coords);
      if (res.status === "checked_in") {
        setLeftPrompt(false);
        setToast("Checked in automatically — you're at the base.");
        router.refresh();
        setTimeout(() => setToast(null), 6000);
      } else if (res.status === "left_site") {
        setLeftPrompt(true);
      } else if (res.status === "on_site" || res.status === "away" || res.status === "done") {
        setLeftPrompt(false);
      }
    } finally {
      busy.current = false;
    }
  }, [router]);

  useEffect(() => {
    void run();
    const id = setInterval(() => void run(), INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void run();
    };
    const onFocus = () => void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [run]);

  function checkOut() {
    void (async () => {
      const res = await selfCheckOut();
      if (res.ok) {
        setLeftPrompt(false);
        router.refresh();
      }
    })();
  }

  if (!leftPrompt && !toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toast && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-lg">
          <MapPin className="h-4 w-4 text-primary" /> {toast}
        </div>
      )}
      {leftPrompt && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg">
          <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Looks like you&apos;ve left the site. Check out?</span>
          <Button size="sm" onClick={checkOut}>
            <LogOut className="h-4 w-4" /> Check out
          </Button>
          <button
            onClick={() => setLeftPrompt(false)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
