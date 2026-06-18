"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Build and download a CSV client-side from a pre-computed table of cells. */
export function CsvExportButton({ filename, table }: { filename: string; table: string[][] }) {
  const onClick = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = table.map((row) => row.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button size="sm" variant="outline" className="print:hidden" onClick={onClick}>
      <Download className="mr-1.5 h-4 w-4" /> Export CSV
    </Button>
  );
}
