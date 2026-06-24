"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DELIVERY_LABEL, type TrainingCourse, type TrainingDelivery } from "@/types/training";
import { setCourseActive, upsertCourse } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const DELIVERIES: TrainingDelivery[] = ["classroom", "online", "on_job", "external", "webinar"];

const empty = {
  id: "",
  title: "",
  code: "",
  category: "",
  delivery: "classroom" as TrainingDelivery,
  isStatutory: false,
  validityMonths: "",
  durationHours: "",
  cost: "",
  description: "",
};

export function CataloguePanel({ courses }: { courses: TrainingCourse[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const editing = !!form.id;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }

  function edit(c: TrainingCourse) {
    setForm({
      id: c.id,
      title: c.title,
      code: c.code ?? "",
      category: c.category ?? "",
      delivery: c.delivery,
      isStatutory: c.is_statutory,
      validityMonths: c.validity_months?.toString() ?? "",
      durationHours: c.duration_hours?.toString() ?? "",
      cost: c.cost?.toString() ?? "",
      description: c.description ?? "",
    });
  }

  function save() {
    run(
      () =>
        upsertCourse({
          id: form.id || undefined,
          title: form.title,
          code: form.code,
          category: form.category,
          delivery: form.delivery,
          isStatutory: form.isStatutory,
          validityMonths: form.validityMonths ? Number(form.validityMonths) : null,
          durationHours: form.durationHours ? Number(form.durationHours) : null,
          cost: form.cost ? Number(form.cost) : null,
          description: form.description,
        }),
      () => setForm(empty),
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-primary" /> Training Catalogue
        </h2>
        <p className="text-sm text-muted-foreground">
          Define courses, mark statutory ones and set certificate validity (months).
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground sm:col-span-2">
          Title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Code
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Category
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Delivery
          <select value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value as TrainingDelivery })} className={cn(field, "mt-0.5 block w-full")}>
            {DELIVERIES.map((d) => (
              <option key={d} value={d}>
                {DELIVERY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Validity (months)
          <input type="number" min={0} value={form.validityMonths} onChange={(e) => setForm({ ...form, validityMonths: e.target.value })} placeholder="never" className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Duration (hours)
          <input type="number" min={0} step="0.5" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Cost
          <input type="number" min={0} step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" checked={form.isStatutory} onChange={(e) => setForm({ ...form, isStatutory: e.target.checked })} />
          Statutory / mandatory for everyone
        </label>
        <div className="flex items-end gap-2 sm:col-span-3">
          <Button size="sm" disabled={pending || !form.title.trim()} onClick={save}>
            {editing ? "Save changes" : "Add course"}
          </Button>
          {editing && (
            <button type="button" onClick={() => setForm(empty)} className="text-xs text-muted-foreground hover:text-foreground">
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">Delivery</th>
              <th className="px-4 py-2 font-medium">Statutory</th>
              <th className="px-4 py-2 font-medium">Validity</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className={cn("border-t", !c.is_active && "opacity-50")}>
                <td className="px-4 py-2 font-medium">
                  {c.title}
                  {c.code && <span className="ml-2 text-xs text-muted-foreground">{c.code}</span>}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{DELIVERY_LABEL[c.delivery]}</td>
                <td className="px-4 py-2">{c.is_statutory ? "Yes" : "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{c.validity_months ? `${c.validity_months} mo` : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button disabled={pending} onClick={() => edit(c)} className="text-xs text-primary hover:underline">
                      Edit
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => run(() => setCourseActive(c.id, !c.is_active))}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      {c.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No courses yet — add your first above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
