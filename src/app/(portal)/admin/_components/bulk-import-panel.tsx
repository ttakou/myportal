"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Download, FileUp, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { bulkRegisterStaff, type BulkRow, type BulkRowResult } from "../actions";

const TEMPLATE =
  "full_name,email,manager_email,role,department,employee_type\n" +
  "Jane Doe,jane@acme.com,,manager,Operations,employee\n" +
  "John Roe,,Jane Doe,employee,Operations,employee\n";

/** Split a CSV line respecting simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const ALIASES: Record<string, keyof BulkRow> = {
  full_name: "fullName",
  name: "fullName",
  "full name": "fullName",
  email: "email",
  manager_email: "managerEmail",
  manager: "managerEmail",
  "manager email": "managerEmail",
  role: "role",
  department: "department",
  dept: "department",
  employee_type: "employeeType",
  type: "employeeType",
};

function parseCsv(text: string): { rows: BulkRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "Need a header row and at least one data row." };

  const headers = splitCsvLine(lines[0]).map((h) => ALIASES[h.toLowerCase()] ?? null);
  if (!headers.includes("fullName")) {
    return { rows: [], error: "Header must include at least full_name (email is optional)." };
  }

  const rows: BulkRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: BulkRow = { fullName: "", email: "" };
    headers.forEach((key, idx) => {
      if (key) (row[key] as string) = cells[idx] ?? "";
    });
    if (row.fullName || row.email) rows.push(row);
  }
  return { rows };
}

export function BulkImportPanel() {
  const [pending, startTransition] = useStatusTransition("Importing…");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [mode, setMode] = useState<"invite" | "password">("password");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<BulkRowResult[] | null>(null);

  function loadText(text: string, name: string) {
    setResults(null);
    const { rows: parsed, error: e } = parseCsv(text);
    setError(e ?? null);
    setRows(parsed);
    setFileName(name);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => loadText(t, file.name));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await bulkRegisterStaff({ mode, rows });
      if (!res.ok && !res.results) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setResults(res.results ?? []);
      setRows([]);
      setFileName("");
    });
  }

  function downloadTemplate() {
    triggerDownload(TEMPLATE, "staff-import-template.csv");
  }

  function downloadCredentials() {
    if (!results) return;
    const created = results.filter((r) => r.status === "created" && r.tempPassword);
    const csv =
      "email,temporary_password\n" +
      created.map((r) => `${r.email},${r.tempPassword}`).join("\n");
    triggerDownload(csv, "staff-credentials.csv");
  }

  const counts = results
    ? {
        created: results.filter((r) => r.status === "created").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
        hasPasswords: results.some((r) => r.tempPassword),
      }
    : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <FileUp className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Bulk import staff</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload a CSV with columns <code>full_name, email, manager_email, role, department,
        employee_type</code>. <strong>Email is optional</strong> — without it the account is created
        as &ldquo;email pending&rdquo;. People already on file (matched by email, or by name when no
        email) are skipped; managers are linked by email or name and can appear anywhere in the file.
      </p>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" />
            Choose CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Template
          </button>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "invite" | "password")}
            className="ml-auto rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="password">Temporary passwords</option>
            <option value="invite">Invitation emails</option>
          </select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {rows.length > 0 && (
          <>
            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Manager</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Dept</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{r.fullName || <span className="text-destructive">—</span>}</td>
                      <td className="px-3 py-1.5">{r.email}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.managerEmail || "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.role || "employee"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.department || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{rows.length} row(s) ready</span>
              <Button disabled={pending} onClick={submit}>
                {pending ? "Importing…" : `Import ${rows.length} staff`}
              </Button>
            </div>
          </>
        )}

        {counts && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-700">
                {counts.created} created
              </span>
              {counts.skipped > 0 && (
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  {counts.skipped} skipped
                </span>
              )}
              {counts.failed > 0 && (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                  {counts.failed} failed
                </span>
              )}
              {counts.hasPasswords && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={downloadCredentials}>
                  <Download className="h-3.5 w-3.5" /> Download credentials
                </Button>
              )}
            </div>
            {results!.some((r) => r.status !== "created") && (
              <ul className="space-y-0.5 text-xs">
                {results!
                  .filter((r) => r.status !== "created")
                  .map((r, i) => (
                    <li key={i} className={cn(r.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      {r.email}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
