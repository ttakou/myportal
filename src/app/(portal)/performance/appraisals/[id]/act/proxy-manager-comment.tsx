"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { setManagerComment } from "../../actions";

/**
 * The line manager's comment, written here by whoever is standing in.
 *
 * The manager's own place to write this is the team review panel; this is for
 * the case the page exists for — the manager is unreachable and HR is holding
 * the phase open waiting for a comment that nobody can enter.
 */
export function ProxyManagerComment({
  appraisalId,
  employeeName,
  managerName,
  initial,
}: {
  appraisalId: string;
  employeeName: string;
  managerName: string | null;
  initial: string | null;
}) {
  const [comment, setComment] = useState(initial ?? "");
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = comment.trim() !== (initial ?? "").trim();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setManagerComment({ appraisalId, comment });
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Couldn't save the comment.");
    });
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">Line manager comments</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        What {managerName ?? "the line manager"} says about {employeeName}&apos;s work this phase.{" "}
        {employeeName} sees this on their own appraisal and confirms they have read it at the
        sign-off that follows. Saving it is recorded as you acting for{" "}
        {managerName ?? "the line manager"}.
      </p>
      <textarea
        value={comment}
        disabled={pending}
        onChange={(e) => {
          setSaved(false);
          setComment(e.target.value);
        }}
        rows={5}
        placeholder="Dictated by the line manager, or taken from their written review…"
        className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !changed} onClick={save}>
          Save comment
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !changed}
          onClick={() => {
            setComment(initial ?? "");
            setError(null);
            setSaved(false);
          }}
        >
          Reset
        </Button>
        {saved && !changed && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
