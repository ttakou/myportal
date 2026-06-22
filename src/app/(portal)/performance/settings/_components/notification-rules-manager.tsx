"use client";

import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CHANNELS,
  CHANNEL_LABEL,
  EVENT_LABEL,
  FREQUENCY_LABEL,
  NOTIFICATION_EVENTS,
  RECIPIENT_LABEL,
  RECIPIENT_ROLES,
  TIMING_LABEL,
  type Channel,
  type Frequency,
  type NotificationEvent,
  type NotificationRule,
  type RecipientRole,
  type Timing,
} from "@/types/notifications";
import { saveNotificationRule, deleteNotificationRule } from "../notification-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const newRule = (event: NotificationEvent): NotificationRule => ({
  id: `new-${Math.random().toString(36).slice(2, 8)}`,
  event,
  recipients: ["employee"],
  customEmails: [],
  channels: ["in_app"],
  subjectTemplate: "",
  bodyTemplate: "",
  timing: "immediate",
  offsetDays: 0,
  frequency: "once",
  escalateAfterDays: null,
  escalateTo: null,
  isEnabled: true,
});

export function NotificationRulesManager({ rules }: { rules: NotificationRule[] }) {
  const [list, setList] = useState<NotificationRule[]>(rules);

  const update = (id: string, patch: Partial<NotificationRule>) =>
    setList((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = (event: NotificationEvent) => setList((l) => [...l, newRule(event)]);
  const drop = (id: string) => setList((l) => l.filter((r) => r.id !== id));

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Templates support placeholders like{" "}
        <code>{"{{employee}}"}</code>, <code>{"{{cycle}}"}</code>, <code>{"{{deadline}}"}</code>,{" "}
        <code>{"{{reason}}"}</code> and <code>{"{{rating}}"}</code>.
      </p>
      {NOTIFICATION_EVENTS.map((event) => {
        const eventRules = list.filter((r) => r.event === event);
        return (
          <section key={event} className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">{EVENT_LABEL[event]}</h2>
              <Button variant="outline" size="sm" onClick={() => add(event)}>
                <Plus className="h-4 w-4" /> Add rule
              </Button>
            </div>
            {eventRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications for this event.</p>
            ) : (
              <div className="space-y-3">
                {eventRules.map((r) => (
                  <RuleEditor key={r.id} rule={r} onChange={(p) => update(r.id, p)} onDrop={() => drop(r.id)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onDrop,
}: {
  rule: NotificationRule;
  onChange: (patch: Partial<NotificationRule>) => void;
  onDrop: () => void;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveNotificationRule(rule);
      if (!res.ok) setError(res.error ?? "Couldn't save.");
      else setSaved(true);
    });
  }
  function remove() {
    startTransition(async () => {
      if (!rule.id.startsWith("new-")) await deleteNotificationRule(rule.id);
      onDrop();
    });
  }

  return (
    <div className={cn("space-y-3 rounded-md border p-3", !rule.isEnabled && "opacity-60")}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rule.isEnabled} onChange={(e) => onChange({ isEnabled: e.target.checked })} className="h-4 w-4" />
          Enabled
        </label>
        <Button variant="ghost" size="sm" onClick={remove} disabled={pending} aria-label="Delete rule">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Chips label="Recipients" options={RECIPIENT_ROLES} selected={rule.recipients} labelOf={(r: RecipientRole) => RECIPIENT_LABEL[r]} onToggle={(v) => onChange({ recipients: toggle(rule.recipients, v) })} />

      <label className="block text-xs text-muted-foreground">
        Extra email addresses (comma-separated)
        <input
          value={rule.customEmails.join(", ")}
          onChange={(e) => onChange({ customEmails: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
          placeholder="e.g. hrbox@company.com"
          className={cn(field, "mt-0.5 block w-full py-1.5")}
        />
      </label>

      <Chips label="Channels" options={CHANNELS} selected={rule.channels} labelOf={(c: Channel) => CHANNEL_LABEL[c]} onToggle={(v) => onChange({ channels: toggle(rule.channels, v) })} />

      <label className="block text-xs text-muted-foreground">
        Subject template
        <input value={rule.subjectTemplate} onChange={(e) => onChange({ subjectTemplate: e.target.value })} className={cn(field, "mt-0.5 block w-full py-1.5")} />
      </label>
      <label className="block text-xs text-muted-foreground">
        Body template
        <textarea value={rule.bodyTemplate} onChange={(e) => onChange({ bodyTemplate: e.target.value })} rows={2} className={cn(field, "mt-0.5 block w-full")} />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Timing
          <select value={rule.timing} onChange={(e) => onChange({ timing: e.target.value as Timing })} className={cn(field, "mt-0.5 block py-1.5")}>
            {(Object.keys(TIMING_LABEL) as Timing[]).map((t) => (
              <option key={t} value={t}>{TIMING_LABEL[t]}</option>
            ))}
          </select>
        </label>
        {rule.timing !== "immediate" && (
          <label className="text-xs text-muted-foreground">
            Days {rule.timing}
            <input type="number" min={0} max={90} value={rule.offsetDays} onChange={(e) => onChange({ offsetDays: Number(e.target.value) })} className={cn(field, "mt-0.5 block w-20 py-1")} />
          </label>
        )}
        <label className="text-xs text-muted-foreground">
          Frequency
          <select value={rule.frequency} onChange={(e) => onChange({ frequency: e.target.value as Frequency })} className={cn(field, "mt-0.5 block py-1.5")}>
            {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Escalate after (days)
          <input
            type="number"
            min={0}
            max={90}
            value={rule.escalateAfterDays ?? ""}
            placeholder="—"
            onChange={(e) => onChange({ escalateAfterDays: e.target.value === "" ? null : Number(e.target.value) })}
            className={cn(field, "mt-0.5 block w-24 py-1")}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Escalate to
          <select value={rule.escalateTo ?? ""} onChange={(e) => onChange({ escalateTo: (e.target.value || null) as RecipientRole | null })} className={cn(field, "mt-0.5 block py-1.5")}>
            <option value="">— none —</option>
            {RECIPIENT_ROLES.map((r) => (
              <option key={r} value={r}>{RECIPIENT_LABEL[r]}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          <Check className="h-4 w-4" /> Save
        </Button>
        {saved && !pending && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </div>
  );
}

function Chips<T extends string>({
  label,
  options,
  selected,
  labelOf,
  onToggle,
}: {
  label: string;
  options: T[];
  selected: T[];
  labelOf: (v: T) => string;
  onToggle: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              selected.includes(o) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {labelOf(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
