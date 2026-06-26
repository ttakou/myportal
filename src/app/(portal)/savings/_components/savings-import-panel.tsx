"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Download, FileUp, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { money } from "@/types/savings";
import {
  importMonthlySavings,
  previewMonthlySavings,
  type SavingsImportPreview,
  type SavingsImportRow,
  type SavingsImportRowResult,
  type SavingsPreviewStatus,
} from "../actions";

const TEMPLATE = "emp_num,amount\n10234,50000\n10235,75000\n";

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

const EMP_ALIASES = ["emp_num", "employee_number", "employee #", "employee no", "matricule", "number", "emp"];
const AMT_ALIASES = ["amount", "saving", "savings", "montant", "amount_xaf", "amount (xaf)"];

function parseCsv(text: string): { rows: SavingsImportRow[]; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "Need a header row and at least one data row." };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const empIdx = header.findIndex((h) => EMP_ALIASES.includes(h));
  const amtIdx = header.findIndex((h) => AMT_ALIASES.includes(h));
  if (empIdx === -1 || amtIdx === -1) {
    return { rows: [], error: "Header must include an employee-number column and an amount column." };
  }

  const rows: SavingsImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const empNum = (cells[empIdx] ?? "").trim();
    // Tolerate thousands separators and currency text in the amount cell.
    const amount = Number((cells[amtIdx] ?? "").replace(/[^\d.-]/g, ""));
    if (!empNum && !amount) continue;
    rows.push({ empNum, amount });
  }
  return { rows };
}

function currentMonth(): string {
  // Avoid Date in module scope; compute on the client at render time.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_BADGE: Record<SavingsPreviewStatus, { label: string; cls: string }> = {
  apply: { label: "Will credit", cls: "bg-green-100 text-green-700" },
  "new-account": { label: "New account", cls: "bg-blue-100 text-blue-700" },
  skip: { label: "Already imported", cls: "bg-muted text-muted-foreground" },
  error: { label: "Error", cls: "bg-destructive/10 text-destructive" },
};

export function SavingsImportPanel() {
  const [pending, startTransition] = useStatusTransition("Working…");
  const [rows, setRows] = useState<SavingsImportRow[]>([]);
  const [period, setPeriod] = useState(currentMonth());
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<SavingsImportPreview | null>(null);
  const [results, setResults] = useState<SavingsImportRowResult[] | null>(null);

  function reset(keepPeriod = true) {
    setRows([]);
    setFileName("");
    setPreview(null);
    setResults(null);
    setError(null);
    if (!keepPeriod) setPeriod(currentMonth());
  }

  function loadText(text: string, name: string) {
    setResults(null);
    setPreview(null);
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

  // Step 1 → 2: dry-run the import and show the impact report.
  function runPreview() {
    setError(null);
    startTransition(async () => {
      const res = await previewMonthlySavings({ period, rows });
      if (!res.ok) {
        setError(res.error ?? "Could not build the preview.");
        return;
      }
      setPreview(res);
    });
  }

  // Step 2 → 3: commit the validated import.
  function commit() {
    setError(null);
    startTransition(async () => {
      const res = await importMonthlySavings({ period, rows });
      if (!res.ok && !res.results) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setResults(res.results ?? []);
      setRows([]);
      setFileName("");
      setPreview(null);
    });
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "savings-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = results
    ? {
        applied: results.filter((r) => r.status === "applied").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      }
    : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <FileUp className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Import monthly savings</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload the monthly sheet with columns <code>emp_num, amount</code> (amounts in XAF). You
        preview the impact on every account first, then validate before anything is committed.
        Re-importing the same month is safe — already-imported rows are skipped. Export your Excel
        sheet as CSV first.
      </p>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        {/* Upload controls — hidden once committed */}
        {!results && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium">
              Month{" "}
              <input
                type="month"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setPreview(null);
                }}
                className="ml-1 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
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
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Step 1: parsed rows + "Preview impact" */}
        {rows.length > 0 && !preview && !results && (
          <>
            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Employee #</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{r.empNum || <span className="text-destructive">—</span>}</td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", !(r.amount > 0) && "text-destructive")}>
                        {r.amount > 0 ? money(r.amount) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {rows.length} row(s) for {period}
              </span>
              <Button disabled={pending || !period} onClick={runPreview}>
                {pending ? "Calculating…" : "Preview impact"}
              </Button>
            </div>
          </>
        )}

        {/* Step 2: impact report + validate/commit */}
        {preview?.summary && !results && (
          <div className="space-y-3">
            <div className="rounded-md border bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
              Review the impact below. Nothing has been saved yet — click{" "}
              <span className="font-medium">Confirm &amp; commit</span> to apply it to the accounts.
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Will credit" value={String(preview.summary.willApply)} tone="green" />
              <Kpi label="New accounts" value={String(preview.summary.newAccounts)} />
              <Kpi label="Already imported" value={String(preview.summary.alreadyImported)} />
              <Kpi label="Errors" value={String(preview.summary.errors)} tone={preview.summary.errors ? "red" : undefined} />
            </div>
            <p className="text-sm text-muted-foreground">
              Total to credit for {preview.period}:{" "}
              <span className="font-semibold text-foreground">{money(preview.summary.totalContribution)}</span> ·
              balances {money(preview.summary.totalCurrent)} → {money(preview.summary.totalNew)}
            </p>

            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium text-right">Current</th>
                    <th className="px-3 py-2 font-medium text-right">Contribution</th>
                    <th className="px-3 py-2 font-medium text-right">New balance</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.rows!.map((r, i) => {
                    const badge = STATUS_BADGE[r.status];
                    return (
                      <tr key={i} className={cn(r.status === "error" && "bg-destructive/5")}>
                        <td className="px-3 py-1.5">
                          <span className="font-medium">{r.name ?? "—"}</span>{" "}
                          <span className="text-xs text-muted-foreground">#{r.empNum}</span>
                          {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.currentBalance != null ? money(r.currentBalance) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.status === "error" ? "—" : money(r.amount)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {r.newBalance != null ? money(r.newBalance) : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.cls)}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setPreview(null)}>
                Back
              </Button>
              <Button
                disabled={pending || preview.summary.willApply === 0}
                onClick={commit}
              >
                {pending ? "Committing…" : `Confirm & commit ${preview.summary.willApply}`}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: committed result */}
        {counts && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-700">
                {counts.applied} committed
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
              <button
                type="button"
                onClick={() => reset()}
                className="ml-auto text-sm text-muted-foreground hover:text-foreground"
              >
                Import another month
              </button>
            </div>
            {results!.some((r) => r.status !== "applied") && (
              <ul className="space-y-0.5 text-xs">
                {results!
                  .filter((r) => r.status !== "applied")
                  .map((r, i) => (
                    <li key={i} className={cn(r.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      #{r.empNum}
                      {r.name ? ` (${r.name})` : ""}: {r.error}
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background px-3 py-2",
        tone === "green" && "border-green-300 bg-green-50",
        tone === "red" && value !== "0" && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
