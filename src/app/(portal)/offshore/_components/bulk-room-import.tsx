"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Download, FileUp, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { bulkUpsertRooms, type BulkRoomResult, type BulkRoomRow } from "../actions";

const TEMPLATE =
  "installation,block,floor,room_number,room_type,bed_count,max_bed_count,gender,status,special_flag,notes\n" +
  "Platform A,Block 1,Level 2,A-201,double,2,2,any,available,,\n" +
  "Platform A,Block 1,Level 2,A-202,shared,4,4,male,available,,Near control room\n";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const ALIASES: Record<string, keyof BulkRoomRow> = {
  installation: "installation",
  site: "installation",
  block: "block",
  floor: "floor",
  location: "floor",
  room_number: "roomNumber",
  room: "roomNumber",
  "room no": "roomNumber",
  room_type: "roomType",
  type: "roomType",
  bed_count: "bedCount",
  beds: "bedCount",
  max_bed_count: "maxBedCount",
  gender: "gender",
  status: "status",
  special_flag: "specialFlag",
  flag: "specialFlag",
  notes: "notes",
};

function parseCsv(text: string): { rows: BulkRoomRow[]; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "Need a header row and at least one data row." };
  const headers = splitCsvLine(lines[0]).map((h) => ALIASES[h.toLowerCase()] ?? null);
  if (!headers.includes("installation") || !headers.includes("roomNumber")) {
    return { rows: [], error: "Header must include at least installation and room_number." };
  }
  const rows: BulkRoomRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = { installation: "", roomNumber: "" } as BulkRoomRow;
    headers.forEach((k, idx) => {
      if (k) (row[k] as string) = cells[idx] ?? "";
    });
    if (row.installation || row.roomNumber) rows.push(row);
  }
  return { rows };
}

function download(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkRoomImport() {
  const [pending, startTransition] = useStatusTransition("Importing…");
  const [rows, setRows] = useState<BulkRoomRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<BulkRoomResult[] | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults(null);
    file.text().then((t) => {
      const { rows: parsed, error: err } = parseCsv(t);
      setError(err ?? null);
      setRows(parsed);
      setFileName(file.name);
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await bulkUpsertRooms(rows);
      if (!res.ok && !res.results) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setResults(res.results ?? []);
      setRows([]);
      setFileName("");
    });
  }

  const counts = results
    ? {
        created: results.filter((r) => r.status === "created").length,
        updated: results.filter((r) => r.status === "updated").length,
        failed: results.filter((r) => r.status === "failed").length,
      }
    : null;

  return (
    <details className="rounded-lg border border-dashed bg-card/50 p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <FileUp className="h-4 w-4" /> Bulk import rooms (CSV)
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Columns: <code>installation, block, floor, room_number, room_type, bed_count,
          max_bed_count, gender, status, special_flag, notes</code>. Installation is matched by
          name. Existing rooms (same installation + number) are updated.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" /> Choose CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          <button
            type="button"
            onClick={() => download(TEMPLATE, "offshore-rooms-template.csv")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Template
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {rows.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{rows.length} room(s) ready</span>
            <Button size="sm" disabled={pending} onClick={submit}>
              {pending ? "Importing…" : `Import ${rows.length} rooms`}
            </Button>
          </div>
        )}

        {counts && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-700">
                {counts.created} created
              </span>
              {counts.updated > 0 && (
                <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground">
                  {counts.updated} updated
                </span>
              )}
              {counts.failed > 0 && (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                  {counts.failed} failed
                </span>
              )}
            </div>
            {results!.some((r) => !r.ok) && (
              <ul className="space-y-0.5 text-xs text-destructive">
                {results!
                  .filter((r) => !r.ok)
                  .map((r, i) => (
                    <li key={i}>
                      {r.room}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
