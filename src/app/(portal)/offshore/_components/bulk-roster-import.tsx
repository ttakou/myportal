"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Download, FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkUpsertRoster, type BulkRosterResult, type BulkRosterRow } from "../actions";

const TEMPLATE =
  "person,crew,position,company,fixed_room,fixed_bed,back_to_back,medical_expiry,bosiet_expiry,huet_expiry,emergency_contact,travel_eligible\n" +
  "alain.abena@acme.com,Crew A,Technician,APCC,A-201,Bed 1,joseph.akoson@acme.com,2026-12-31,2027-06-30,2027-06-30,+237 6xx xxx xxx,yes\n";

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

const ALIASES: Record<string, keyof BulkRosterRow> = {
  person: "person",
  email: "person",
  name: "person",
  crew: "crew",
  position: "position",
  company: "company",
  fixed_room: "fixedRoom",
  room: "fixedRoom",
  fixed_bed: "fixedBed",
  bed: "fixedBed",
  back_to_back: "backToBack",
  b2b: "backToBack",
  medical_expiry: "medicalExpiry",
  medical: "medicalExpiry",
  bosiet_expiry: "bosietExpiry",
  bosiet: "bosietExpiry",
  huet_expiry: "huetExpiry",
  huet: "huetExpiry",
  emergency_contact: "emergencyContact",
  ice: "emergencyContact",
  travel_eligible: "travelEligible",
  eligible: "travelEligible",
};

function parseCsv(text: string): { rows: BulkRosterRow[]; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "Need a header row and at least one data row." };
  const headers = splitCsvLine(lines[0]).map((h) => ALIASES[h.toLowerCase()] ?? null);
  if (!headers.includes("person")) {
    return { rows: [], error: "Header must include person (email or name)." };
  }
  const rows: BulkRosterRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row = { person: "" } as BulkRosterRow;
    headers.forEach((k, idx) => {
      if (k) (row[k] as string) = cells[idx] ?? "";
    });
    if (row.person) rows.push(row);
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

export function BulkRosterImport() {
  const [pending, startTransition] = useStatusTransition("Importing…");
  const [rows, setRows] = useState<BulkRosterRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<BulkRosterResult[] | null>(null);

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
      const res = await bulkUpsertRoster(rows);
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
        <FileUp className="h-4 w-4" /> Bulk import offshore staff (CSV)
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Columns: <code>person, crew, position, company, fixed_room, fixed_bed, back_to_back,
          medical_expiry, bosiet_expiry, huet_expiry, emergency_contact, travel_eligible</code>.
          <span className="block">
            <strong>person</strong> and <strong>back_to_back</strong> match an existing user by
            email or name; crew by name; fixed_room by room number; dates as YYYY-MM-DD. Existing
            roster members are updated.
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" /> Choose CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          <button
            type="button"
            onClick={() => download(TEMPLATE, "offshore-staff-template.csv")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Template
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {rows.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{rows.length} person(s) ready</span>
            <Button size="sm" disabled={pending} onClick={submit}>
              {pending ? "Importing…" : `Import ${rows.length} staff`}
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
                      {r.person}: {r.error}
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
