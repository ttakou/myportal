"use client";

import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import { setPotentialRating } from "../../settings/calibration-actions";

const LABELS: Record<string, string> = { "": "—", "1": "Low", "2": "Medium", "3": "High" };

export function PotentialSelect({ appraisalId, value }: { appraisalId: string; value: number | null }) {
  const [pending, startTransition] = useStatusTransition("Saving…");

  return (
    <select
      defaultValue={value == null ? "" : String(value)}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setPotentialRating(appraisalId, e.target.value === "" ? null : Number(e.target.value));
        })
      }
      className={cn("rounded-md border bg-background px-2 py-1 text-xs")}
    >
      {Object.entries(LABELS).map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
