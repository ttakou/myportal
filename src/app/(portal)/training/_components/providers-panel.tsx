"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types/training";
import { setProviderActive, upsertProvider } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const blank = { id: "", name: "", contactName: "", email: "", phone: "" };

export function ProvidersPanel({ providers }: { providers: Provider[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);

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
          <Building2 className="h-5 w-5 text-primary" /> Training Providers
        </h2>
        <p className="text-sm text-muted-foreground">External training organisations.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-4">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={cn(field, "sm:col-span-2")} />
        <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Contact" className={field} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={field} />
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={field} />
        <div className="flex items-center gap-2 sm:col-span-3">
          <Button size="sm" disabled={pending || !form.name.trim()} onClick={() => run(() => upsertProvider({ id: form.id || undefined, name: form.name, contactName: form.contactName, email: form.email, phone: form.phone }), () => setForm(blank))}>
            {form.id ? "Save" : "Add provider"}
          </Button>
          {form.id && (
            <button type="button" onClick={() => setForm(blank)} className="text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className={cn("border-t", !p.is_active && "opacity-50")}>
                <td className="px-4 py-2 font-medium">{p.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{[p.contact_name, p.email, p.phone].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button disabled={pending} onClick={() => setForm({ id: p.id, name: p.name, contactName: p.contact_name ?? "", email: p.email ?? "", phone: p.phone ?? "" })} className="text-xs text-primary hover:underline">Edit</button>
                    <button disabled={pending} onClick={() => run(() => setProviderActive(p.id, !p.is_active))} className="text-xs text-muted-foreground hover:underline">{p.is_active ? "Deactivate" : "Activate"}</button>
                  </div>
                </td>
              </tr>
            ))}
            {providers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No providers yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
