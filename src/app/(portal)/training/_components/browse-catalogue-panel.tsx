"use client";

import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DELIVERY_LABEL, type TrainingCourse } from "@/types/training";
import { submitTrainingRequest } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function BrowseCataloguePanel({ courses }: { courses: TrainingCourse[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  const categories = useMemo(
    () => [...new Set(courses.map((c) => c.category).filter(Boolean) as string[])].sort(),
    [courses],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courses.filter(
      (c) =>
        c.is_active &&
        (!cat || c.category === cat) &&
        (!needle ||
          c.title.toLowerCase().includes(needle) ||
          (c.code ?? "").toLowerCase().includes(needle) ||
          (c.description ?? "").toLowerCase().includes(needle)),
    );
  }, [courses, q, cat]);

  function request(c: TrainingCourse) {
    setError(null);
    startTransition(async () => {
      const res = await submitTrainingRequest({ courseId: c.id, origin: "employee_request" });
      if (!res.ok) setError(res.error ?? "Failed.");
      else setDone((d) => ({ ...d, [c.id]: true }));
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-primary" /> Browse Courses
        </h2>
        <p className="text-sm text-muted-foreground">Browse available courses and request the ones you need.</p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses…"
            className={cn(field, "w-full pl-8")}
          />
        </div>
        {categories.length > 0 && (
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={field}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No courses match.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="flex flex-col rounded-lg border bg-card p-4">
              <div className="flex-1">
                <p className="font-medium">{c.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {DELIVERY_LABEL[c.delivery]}
                  {c.category && ` · ${c.category}`}
                  {c.is_statutory && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">statutory</span>}
                </p>
                {c.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{c.description}</p>}
                {c.validity_months != null && (
                  <p className="mt-2 text-xs text-muted-foreground">Valid {c.validity_months} months</p>
                )}
              </div>
              <Button size="sm" variant="outline" className="mt-3" disabled={pending || done[c.id]} onClick={() => request(c)}>
                {done[c.id] ? "Requested ✓" : "Request this course"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
