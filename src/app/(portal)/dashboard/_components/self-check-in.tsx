"use client";

import { useState } from "react";
import { LogOut, MapPin } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import type { MyAttendance } from "@/types/staff-attendance";
import { selfCheckOut } from "@/app/(portal)/visitors/staff-actions";

function time(ts: string | null): string {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

/**
 * Today's attendance, as recorded — no button to press.
 *
 * The base knows who is there from the gate: security records arrivals
 * (423 of the 437 attendance rows, by four guards), and the geofence check-in
 * in the app layout still fires silently for anyone who has granted location.
 * The "I'm in" card that sat here was pressed fourteen times by six people
 * in two months and asked offshore staff, who are on a platform, to check in
 * at a base they were nowhere near. So: a line when the gate has you on site
 * or you have left today, nothing at all otherwise.
 */
export function SelfCheckIn({ initial }: { initial: MyAttendance }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  if (initial.status === "away") return null;

  function checkOut() {
    setError(null);
    startTransition(async () => {
      const res = await selfCheckOut();
      if (!res.ok) setError(res.error ?? "Couldn't check you out.");
    });
  }

  const onSite = initial.status === "on_site";
  const via = initial.check_in_method === "guard" ? "recorded at the gate" : "from your check-in";

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
      <MapPin className={onSite ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
      <span>
        {onSite ? (
          <>
            <span className="font-medium">On site</span> since {time(initial.check_in_at)}, {via}.
          </>
        ) : (
          <>
            <span className="font-medium">Left</span> at {time(initial.check_out_at)}; in since {time(initial.check_in_at)}.
          </>
        )}
      </span>
      {onSite && (
        <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={checkOut}>
          <LogOut className="h-4 w-4" /> Check out
        </Button>
      )}
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </section>
  );
}
