"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Provider, Trainer } from "@/types/training";
import { setTrainerActive, upsertTrainer } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const blank = { id: "", fullName: "", email: "", expertise: "", providerId: "", isInternal: true };

export function TrainersPanel({ trainers, providers }: { trainers: Trainer[]; providers: Provider[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const providerName = (id: string | null) => providers.find((p) => p.id === id)?.name ?? "—";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="h-5 w-5 text-primary" /> Trainers
        </h2>
        <p className="text-sm text-muted-foreground">Internal and external trainers who deliver sessions.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-4">
        <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Full name" className={cn(field, "sm:col-span-2")} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={field} />
        <input value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} placeholder="Expertise" className={field} />
        <select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })} className={cn(field, "sm:col-span-2")}>
          <option value="">Internal (no provider)</option>
          {providers.filter((p) => p.is_active).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isInternal} onChange={(e) => setForm({ ...form, isInternal: e.target.checked })} />
          Internal
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={pending || !form.fullName.trim()} onClick={() => run(() => upsertTrainer({ id: form.id || undefined, fullName: form.fullName, email: form.email, expertise: form.expertise, providerId: form.providerId || null, isInternal: form.isInternal }), () => setForm(blank))}>
            {form.id ? "Save" : "Add trainer"}
          </Button>
          {form.id && (
            <button type="button" onClick={() => setForm(blank)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Trainer</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Expertise</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {trainers.map((t) => (
              <tr key={t.id} className={cn("border-t", !t.is_active && "opacity-50")}>
                <td className="px-4 py-2 font-medium">{t.full_name}{t.is_internal && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">internal</span>}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.is_internal ? "—" : providerName(t.provider_id)}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.expertise ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button disabled={pending} onClick={() => setForm({ id: t.id, fullName: t.full_name, email: t.email ?? "", expertise: t.expertise ?? "", providerId: t.provider_id ?? "", isInternal: t.is_internal })} className="text-xs text-primary hover:underline">Edit</button>
                    <button disabled={pending} onClick={() => run(() => setTrainerActive(t.id, !t.is_active))} className="text-xs text-muted-foreground hover:underline">{t.is_active ? "Deactivate" : "Activate"}</button>
                  </div>
                </td>
              </tr>
            ))}
            {trainers.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No trainers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
