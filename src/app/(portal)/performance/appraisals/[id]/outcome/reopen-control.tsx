"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStatusTransition } from "@/components/activity";
import { Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reopenAppraisal } from "../../actions";

/** HR-only: re-open a closed appraisal to amend it (logs a reason for audit). */
export function ReopenControl({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Re-opening…");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reopenAppraisal({ appraisalId: id, reason });
      if (!res.ok) setError(res.error ?? "Couldn't re-open.");
      else {
        setOpen(false);
        setReason("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Unlock className="h-4 w-4" /> Re-open to amend
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (logged)"
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <Button size="sm" disabled={pending || !reason.trim()} onClick={submit}>
          Re-open
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
