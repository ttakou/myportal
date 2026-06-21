"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the browser print dialog, where the appraisal can be saved as a PDF
 * (Destination → "Save as PDF"). Hidden in the printed output.
 */
export function PrintButton() {
  return (
    <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
      <FileDown className="mr-1.5 h-4 w-4" /> Download PDF
    </Button>
  );
}
