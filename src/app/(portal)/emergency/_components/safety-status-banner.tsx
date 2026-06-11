"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, HandHelping } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Broadcast, CheckinStatus } from "@/types/emergency";
import { submitCheckin } from "../actions";

function getLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

/**
 * Sticky banner shown during an active event that requests accountability.
 * Offers the two explicit paths from the spec: "I am safe" / "I need help".
 */
export function SafetyStatusBanner({
  broadcast,
  initialStatus,
}: {
  broadcast: Broadcast;
  initialStatus: CheckinStatus | null;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<CheckinStatus | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [needHelpNote, setNeedHelpNote] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  function send(next: CheckinStatus, note?: string) {
    setError(null);
    startTransition(async () => {
      const coords = next === "need_help" ? await getLocation() : null;
      const res = await submitCheckin({
        status: next,
        broadcastId: broadcast.id,
        note,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      if (!res.ok) setError(res.error ?? "Could not check in.");
      else {
        setStatus(next);
        setShowHelp(false);
      }
    });
  }

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="font-semibold text-amber-900">{broadcast.title}</p>
          <p className="text-sm text-amber-800">{broadcast.message}</p>

          {status ? (
            <p
              className={cn(
                "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
                status === "safe"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800",
              )}
            >
              {status === "safe" ? (
                <><CheckCircle2 className="h-4 w-4" /> You marked yourself safe</>
              ) : (
                <><HandHelping className="h-4 w-4" /> Assistance requested — help is on the way</>
              )}
              <button
                type="button"
                className="ml-1 underline underline-offset-2"
                onClick={() => setStatus(null)}
              >
                change
              </button>
            </p>
          ) : (
            <p className="mt-3 text-sm font-medium text-amber-900">Are you safe?</p>
          )}

          {!status && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                className="bg-green-600 hover:bg-green-700"
                disabled={pending}
                onClick={() => send("safe")}
              >
                <CheckCircle2 className="h-4 w-4" /> Yes, I am safe
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => setShowHelp((s) => !s)}
              >
                <HandHelping className="h-4 w-4" /> No, I need help
              </Button>
            </div>
          )}

          {showHelp && !status && (
            <div className="mt-3 rounded-lg border border-red-200 bg-white p-3">
              <textarea
                value={needHelpNote}
                onChange={(e) => setNeedHelpNote(e.target.value)}
                rows={2}
                placeholder="Describe your situation (injuries, blockages, location)…"
                className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button
                variant="destructive"
                className="mt-2"
                disabled={pending}
                onClick={() => send("need_help", needHelpNote)}
              >
                {pending ? "Sending…" : "Send help request with my location"}
              </Button>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
