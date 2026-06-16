"use client";

import { useState, useTransition } from "react";
import { Bell, Smartphone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MUTABLE_CATEGORIES,
  type MutableCategory,
  type PrefMap,
} from "@/lib/notification-categories";
import { setNotificationPref } from "../actions";

/**
 * Per-category control over the in-app bell and push delivery. Emergency
 * alerts aren't listed — they're always delivered.
 */
export function NotificationPreferences({ initial }: { initial: PrefMap }) {
  const [prefs, setPrefs] = useState<PrefMap>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(category: MutableCategory, channel: "in_app" | "push" | "email") {
    const next = !prefs[category][channel];
    setPrefs((p) => ({ ...p, [category]: { ...p[category], [channel]: next } }));
    setError(null);
    startTransition(async () => {
      const res = await setNotificationPref(category, channel, next);
      if (!res.ok) {
        setError(res.error ?? "Could not save preference.");
        setPrefs((p) => ({ ...p, [category]: { ...p[category], [channel]: !next } }));
      }
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Notification preferences</h2>
      <p className="text-sm text-muted-foreground">
        Choose what reaches your in-app bell and your devices. Emergency alerts are always
        delivered.
      </p>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  <Bell className="h-3.5 w-3.5" /> In-app
                </span>
              </th>
              <th className="px-4 py-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5" /> Push
                </span>
              </th>
              <th className="px-4 py-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> Email
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {MUTABLE_CATEGORIES.map((c) => (
              <tr key={c.key}>
                <td className="px-4 py-3">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.help}</div>
                </td>
                <td className="px-4 py-3">
                  <Switch
                    on={prefs[c.key].in_app}
                    disabled={pending}
                    onClick={() => toggle(c.key, "in_app")}
                  />
                </td>
                <td className="px-4 py-3">
                  <Switch
                    on={prefs[c.key].push}
                    disabled={pending}
                    onClick={() => toggle(c.key, "push")}
                  />
                </td>
                <td className="px-4 py-3">
                  <Switch
                    on={prefs[c.key].email}
                    disabled={pending}
                    onClick={() => toggle(c.key, "email")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Switch({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
