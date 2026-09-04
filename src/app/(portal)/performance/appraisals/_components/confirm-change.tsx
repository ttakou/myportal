"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeCycleChange, type CycleChange } from "@/lib/performance/cycle-change";

/**
 * The step between clicking and changing the cycle for everybody.
 *
 * Inline rather than a modal: it appears where the click happened, says what
 * will happen to whom, and offers exactly two ways out. Nothing is written
 * until the confirm button is pressed; Cancel puts things back as they were.
 */
export function ConfirmChange({
  change,
  participants,
  cycleName,
  pending,
  onConfirm,
  onCancel,
}: {
  change: CycleChange;
  participants: number | null;
  cycleName?: string | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const text = describeCycleChange(change, { participants, cycleName });
  return (
    <div
      role="alertdialog"
      aria-labelledby="confirm-change-title"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p id="confirm-change-title" className="font-semibold">
            {text.title}
          </p>
          <p className="mt-0.5 text-xs">{text.consequence}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending} onClick={onConfirm}>
              {pending ? "Saving…" : text.confirmLabel}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <span className="text-xs">Nothing changes until you confirm.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
