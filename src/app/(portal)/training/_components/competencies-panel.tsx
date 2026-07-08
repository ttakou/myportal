"use client";

import { useState } from "react";
import { Layers, Trash2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Competency } from "@/types/training";
import type { CompetencyLink } from "@/lib/training";
import { linkCourseCompetency, setCompetencyActive, unlinkCourseCompetency, upsertCompetency } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const blank = { id: "", name: "", code: "", category: "", maxLevel: "5", description: "" };

export function CompetenciesPanel({
  competencies,
  links,
  courses,
}: {
  competencies: Competency[];
  links: CompetencyLink[];
  courses: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [linkComp, setLinkComp] = useState("");
  const [linkCourse, setLinkCourse] = useState("");
  const [linkLevel, setLinkLevel] = useState("1");

  const compName = (id: string) => competencies.find((c) => c.id === id)?.name ?? "—";

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
          <Layers className="h-5 w-5 text-primary" /> Competency Catalogue
        </h2>
        <p className="text-sm text-muted-foreground">Define competencies and link the courses that develop them.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-4">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={cn(field, "sm:col-span-2")} />
        <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Code" className={field} />
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className={field} />
        <input type="number" min={1} max={10} value={form.maxLevel} onChange={(e) => setForm({ ...form, maxLevel: e.target.value })} placeholder="Max level" className={field} />
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className={cn(field, "sm:col-span-3")} />
        <div className="flex items-center gap-2 sm:col-span-4">
          <Button size="sm" disabled={pending || !form.name.trim()} onClick={() => run(() => upsertCompetency({ id: form.id || undefined, name: form.name, code: form.code, category: form.category, maxLevel: Number(form.maxLevel) || 5, description: form.description }), () => setForm(blank))}>
            {form.id ? "Save" : "Add competency"}
          </Button>
          {form.id && <button type="button" onClick={() => setForm(blank)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Competency</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Max level</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {competencies.map((c) => (
              <tr key={c.id} className={cn("border-t", !c.is_active && "opacity-50")}>
                <td className="px-4 py-2 font-medium">{c.name}{c.code && <span className="ml-2 text-xs text-muted-foreground">{c.code}</span>}</td>
                <td className="px-4 py-2 text-muted-foreground">{c.category ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{c.max_level}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button disabled={pending} onClick={() => setForm({ id: c.id, name: c.name, code: c.code ?? "", category: c.category ?? "", maxLevel: String(c.max_level), description: c.description ?? "" })} className="text-xs text-primary hover:underline">Edit</button>
                    <button disabled={pending} onClick={() => run(() => setCompetencyActive(c.id, !c.is_active))} className="text-xs text-muted-foreground hover:underline">{c.is_active ? "Deactivate" : "Activate"}</button>
                  </div>
                </td>
              </tr>
            ))}
            {competencies.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No competencies yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Developed by courses</h3>
        <p className="text-xs text-muted-foreground">Completing a linked course auto-raises the employee&apos;s level to the target.</p>
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
          <select value={linkComp} onChange={(e) => setLinkComp(e.target.value)} className={cn(field, "w-48")}>
            <option value="">— competency —</option>
            {competencies.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={linkCourse} onChange={(e) => setLinkCourse(e.target.value)} className={cn(field, "w-56")}>
            <option value="">— course —</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <input type="number" min={1} value={linkLevel} onChange={(e) => setLinkLevel(e.target.value)} placeholder="Target level" className={cn(field, "w-28")} />
          <Button size="sm" disabled={pending || !linkComp || !linkCourse} onClick={() => run(() => linkCourseCompetency({ competencyId: linkComp, courseId: linkCourse, targetLevel: Number(linkLevel) || 1 }), () => { setLinkCourse(""); setLinkLevel("1"); })}>
            Link
          </Button>
        </div>
        {links.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Competency</th>
                  <th className="px-4 py-2 font-medium">Course</th>
                  <th className="px-4 py-2 font-medium">Target</th>
                  <th className="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{compName(l.competency_id)}</td>
                    <td className="px-4 py-2">{l.course_title}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">L{l.target_level}</td>
                    <td className="px-4 py-2 text-right">
                      <button disabled={pending} title="Unlink" onClick={() => run(() => unlinkCourseCompetency(l.id))} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
