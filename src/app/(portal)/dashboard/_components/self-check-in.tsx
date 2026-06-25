"use client";

import { useState } from "react";
import { Loader2, LogIn, LogOut, MapPin, MapPinOff } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MyAttendance } from "@/types/staff-attendance";
import { selfCheckIn, selfCheckOut } from "@/app/(portal)/visitors/staff-actions";

type Coords = { lat: number; lng: number } | null;

/** Best-effort geolocation; resolves null if denied/unavailable within `timeout`. */
function getLocation(timeout = 10000): Promise<Coords> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    );
  });
}

function time(ts: string | null): string {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

export function SelfCheckIn({ initial }: { initial: MyAttendance }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  function checkIn() {
    setError(null);
    setLocating(true);
    void (async () => {
      // Capture GPS in the browser; the server authoritatively checks the
      // distance to the base before recording the check-in.
      const coords = await getLocation();
      setLocating(false);
      // Remember that location was granted, so the silent auto-reconcile can run
      // even on browsers without the Permissions API (Safari/iOS).
      if (coords) {
        try {
          localStorage.setItem("geo-granted", "1");
        } catch {
          /* ignore */
        }
      }
      startTransition(async () => {
        const res = await selfCheckIn(coords);
        if (!res.ok) setError(res.error ?? "Couldn't check you in.");
      });
    })();
  }

  function checkOut() {
    setError(null);
    startTransition(async () => {
      const res = await selfCheckOut();
      if (!res.ok) setError(res.error ?? "Couldn't check you out.");
    });
  }

  const busy = pending || locating;
  const onSite = initial.status === "on_site";

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md",
              onSite ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-medium">{onSite ? "You're on site" : "Check in to site"}</h2>
            <p className="text-sm text-muted-foreground">
              {onSite
                ? `Checked in at ${time(initial.check_in_at)}.`
                : initial.status === "left"
                  ? `You checked out at ${time(initial.check_out_at)}. Tap “I’m in” to check in again.`
                  : "Tap “I’m in” when you’re at the base — location must be on."}
            </p>
          </div>
        </div>
        {onSite ? (
          <Button variant="outline" disabled={busy} onClick={checkOut}>
            <LogOut className="h-4 w-4" /> Check out
          </Button>
        ) : (
          <Button disabled={busy} onClick={checkIn}>
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {locating ? "Locating…" : "I’m in"}
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </section>
  );
}
