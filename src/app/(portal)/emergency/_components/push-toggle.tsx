"use client";

import { useEffect, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPushState,
  subscribePush,
  unsubscribePush,
  type PushState,
} from "@/lib/push-client";

/**
 * Per-device opt-in for emergency push notifications. Renders nothing until the
 * state is known, and degrades to a quiet hint when push is unsupported or
 * unconfigured (so a missing VAPID key never breaks the page).
 */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useStatusTransition("Updating…");

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  if (state === null || state === "unsupported" || state === "unconfigured") {
    return null;
  }

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = state === "subscribed" ? await unsubscribePush() : await subscribePush();
      if (!res.ok) {
        setError(res.error ?? "Could not update notifications.");
      }
      setState(await getPushState());
    });
  }

  const subscribed = state === "subscribed";
  const denied = state === "denied";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-sm">
        {subscribed ? (
          <BellRing className="h-4 w-4 text-green-600" />
        ) : (
          <Bell className="h-4 w-4 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">Push notifications on this device</p>
          <p className="text-xs text-muted-foreground">
            {denied
              ? "Notifications are blocked in your browser settings."
              : subscribed
                ? "You'll get push notifications even when the app is closed."
                : "Turn on push to be alerted even when the app is closed."}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <Button
        variant={subscribed ? "outline" : "default"}
        size="sm"
        disabled={pending || denied}
        onClick={toggle}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : subscribed ? (
          <>
            <BellOff className="mr-1.5 h-4 w-4" /> Turn off
          </>
        ) : (
          <>
            <Bell className="mr-1.5 h-4 w-4" /> Turn on
          </>
        )}
      </Button>
    </div>
  );
}
