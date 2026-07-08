"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Triggers the browser print dialog (used to save the statement as PDF). */
export function PrintButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="h-4 w-4" /> Print / Save as PDF
    </Button>
  );
}
