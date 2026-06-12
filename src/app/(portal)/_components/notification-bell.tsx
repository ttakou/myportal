"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Car, CheckCheck, Plane, Stamp } from "lucide-react";
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
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Light polling so the bell stays current without reloading the page.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchMyNotifications().then(setFeed);
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);

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
        onClick={() => setOpen((v) => !v)}
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
            {feed.unread > 0 && (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {feed.items.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                You're all caught up.
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
