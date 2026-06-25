"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompetencyGap } from "@/types/training";
import { submitTrainingRequest } from "../actions";

export function GapsPanel({ gaps }: { gaps: CompetencyGap[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  function request(gap: CompetencyGap, courseId: string, courseTitle: string) {
    setError(null);
    startTransition(async () => {
      const res = await submitTrainingRequest({
        courseId,
        reason: `Close competency gap: ${gap.name} (level ${gap.current_level} → ${gap.target_level})`,
        origin: "competency_gap",
      });
      if (!res.ok) setError(res.error ?? "Failed.");
      else setDone((d) => ({ ...d, [`${gap.competency_id}|${courseId}`]: true }));
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <TriangleAlert className="h-5 w-5 text-primary" /> Competency Gaps
        </h2>
        <p className="text-sm text-muted-foreground">
          Competencies where you sit below the level the training catalogue can develop. Request a course to close the gap.
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {gaps.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No competency gaps — you meet the target level for every competency the catalogue develops.
        </p>
      ) : (
        <div className="space-y-3">
          {gaps.map((g) => (
            <div key={g.competency_id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {g.name}
                    {g.category && <span className="ml-2 text-xs text-muted-foreground">{g.category}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Current level {g.current_level} · target {g.target_level} · gap{" "}
                    <span className="font-semibold text-amber-700">{g.gap}</span>
                  </p>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: g.max_level }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-2.5 w-2.5 rounded-sm",
                        i < g.current_level ? "bg-primary" : i < g.target_level ? "bg-amber-300" : "bg-muted",
                      )}
                    />
                  ))}
                </div>
              </div>
              {g.courses.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {g.courses.map((c) => {
                    const key = `${g.competency_id}|${c.id}`;
                    return (
                      <Button
                        key={c.id}
                        size="sm"
                        variant="outline"
                        disabled={pending || done[key]}
                        onClick={() => request(g, c.id, c.title)}
                      >
                        {done[key] ? "Requested ✓" : `Request: ${c.title}`}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
