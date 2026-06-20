"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible wrapper for the HR-Admin appraisal tools (HR dashboard, console
 * and calibration). Hidden behind a button so a manager who is also an HR admin
 * sees their team view first, and reveals the org-wide admin data on demand.
 */
export function AdminToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <ShieldCheck className="h-4 w-4 text-primary" />
        {open ? "Hide HR admin console" : "Show HR admin console"}
        <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-8">{children}</div>}
    </div>
  );
}
