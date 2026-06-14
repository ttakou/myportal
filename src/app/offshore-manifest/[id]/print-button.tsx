"use client";

import { Printer } from "lucide-react";

/** Triggers the browser print dialog (Save as PDF) for the manifest report. */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 print:hidden"
    >
      <Printer className="h-4 w-4" /> Print / Save as PDF
    </button>
  );
}
