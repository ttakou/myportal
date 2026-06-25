"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Car, CheckCheck, Plane, Stamp, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationCategory, NotificationFeed } from "@/lib/notifications";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../notifications-actions";

const ICON: Record<NotificationCategory, typeof Bell> = {
  emergency: AlertTriangle,
  transport: Car,
  flight: Plane,
  approval: Stamp,
  general: Bell,
};

const ICON_COLOR: Record<NotificationCategory, string> = {
  emergency: "text-destructive",
  transport: "text-primary",
  flight: "text-sky-600",
  approval: "text-amber-600",
  general: "text-muted-foreground",
};

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell({ initial }: { initial: NotificationFeed }) {
  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>(initial);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const prevUnread = useRef(initial.unread);
  const mutedRef = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const flashTimer = useRef<number | null>(null);
  const baseTitle = useRef<string>("");

  // Load the saved sound preference once.
  useEffect(() => {
    const m = typeof window !== "undefined" && localStorage.getItem("notif-muted") === "1";
    setMuted(m);
    mutedRef.current = m;
  }, []);

  // A short two-tone chime, synthesised so no audio asset is needed. Best-effort:
  // browsers only allow audio after a user gesture, so it stays silent until the
  // user has interacted with the page at least once.
  function playChime() {
    if (mutedRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") void ctx.resume();
      const start = ctx.currentTime;
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = start + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      });
    } catch {
      /* best-effort */
    }
  }

  // Flash the browser tab title so a background desktop tab grabs attention.
  function startFlash(unread: number) {
    if (flashTimer.current != null) return;
    baseTitle.current = document.title;
    let on = false;
    flashTimer.current = window.setInterval(() => {
      on = !on;
      document.title = on ? `🔔 (${unread}) New notification` : baseTitle.current;
    }, 1000);
  }
  function stopFlash() {
    if (flashTimer.current != null) {
      clearInterval(flashTimer.current);
      flashTimer.current = null;
      if (baseTitle.current) document.title = baseTitle.current;
    }
  }

  // Poll the feed; on a *new* unread, chime and (if the tab is hidden) flash the
  // title. Runs regardless of visibility so a backgrounded tab still alerts.
  useEffect(() => {
    const tick = async () => {
      const f = await fetchMyNotifications();
      if (f.unread > prevUnread.current) {
        playChime();
        if (document.hidden) startFlash(f.unread);
      }
      prevUnread.current = f.unread;
      setFeed(f);
    };
    const id = setInterval(() => void tick(), 20000);
    return () => clearInterval(id);
  }, []);

  // Stop the title flash as soon as the user looks back at the tab.
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) stopFlash();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", stopFlash);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", stopFlash);
      stopFlash();
    };
  }, []);

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    try {
      localStorage.setItem("notif-muted", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!next) playChime(); // preview + unlocks the audio context via this click
  }

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function open_(n: AppNotification) {
    if (!n.read_at) {
      startTransition(async () => {
        await markNotificationRead(n.id);
        setFeed(await fetchMyNotifications());
      });
    }
    if (n.url) router.push(n.url);
    setOpen(false);
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setFeed(await fetchMyNotifications());
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          stopFlash();
          setOpen((v) => !v);
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {feed.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {feed.unread > 9 ? "9+" : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Notifications</span>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMuted}
                title={muted ? "Notification sound off — click to turn on" : "Notification sound on — click to mute"}
                aria-label={muted ? "Unmute notification sound" : "Mute notification sound"}
                className="text-muted-foreground hover:text-foreground"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              {feed.unread > 0 && (
                <button
                  onClick={markAll}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {feed.items.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            )}
            {feed.items.map((n) => {
              const Icon = ICON[n.category];
              return (
                <button
                  key={n.id}
                  onClick={() => open_(n)}
                  className={cn(
                    "flex w-full gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-accent/50",
                    !n.read_at && "bg-primary/5",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_COLOR[n.category])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    {n.body && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{ago(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          <a
            href="/account"
            onClick={() => setOpen(false)}
            className="block border-t px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Notification settings
          </a>
        </div>
      )}
    </div>
  );
}
