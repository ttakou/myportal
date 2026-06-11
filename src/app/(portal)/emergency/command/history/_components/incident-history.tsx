"use client";

import { useMemo, useState } from "react";
import { Download, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  INCIDENT_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  type Incident,
  type IncidentStatus,
  type IncidentType,
  type Severity,
} from "@/types/emergency";

const SEVERITY_BADGE: Record<Severity, string> = {
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_BADGE: Record<IncidentStatus, string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-amber-100 text-amber-700",
  responding: "bg-sky-100 text-sky-700",
  resolved: "bg-green-100 text-green-700",
};

type StatusFilter = IncidentStatus | "all";
type TypeFilter = IncidentType | "all";

function fmt(ts: string | null | undefined) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

/** Build a CSV from the currently-filtered rows and trigger a download. */
function exportCsv(rows: Incident[]) {
  const headers = [
    "Reported",
    "Type",
    "SOS",
    "Severity",
    "Status",
    "Reporter",
    "Department",
    "Location",
    "Note",
    "Resolved at",
    "Resolved by",
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((i) =>
    [
      fmt(i.created_at),
      INCIDENT_LABEL[i.incident_type],
      i.is_sos ? "Yes" : "No",
      SEVERITY_LABEL[i.severity],
      STATUS_LABEL[i.status],
      i.reporter_name ?? "Unknown",
      i.reporter_department ?? "",
      i.location_text ?? (i.lat != null ? `${i.lat}, ${i.lng}` : ""),
      i.note ?? "",
      fmt(i.resolved_at),
      i.resolved_by_name ?? "",
    ]
      .map((c) => escape(String(c)))
      .join(","),
  );
  const csv = [headers.map(escape).join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `incident-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function IncidentHistory({ incidents }: { incidents: Incident[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (type !== "all" && i.incident_type !== type) return false;
      if (q) {
        const hay = [
          i.reporter_name,
          i.reporter_department,
          i.note,
          i.location_text,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, status, type, query]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Reporter, note, location…"
              className="w-56 rounded-md border bg-background py-2 pl-8 pr-3 text-sm"
            />
          </span>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="responding">Responding</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All types</option>
            {(Object.keys(INCIDENT_LABEL) as IncidentType[]).map((t) => (
              <option key={t} value={t}>
                {INCIDENT_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {incidents.length}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => exportCsv(filtered)}
          >
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Reported</th>
              <th className="px-4 py-3 font-medium">Incident</th>
              <th className="px-4 py-3 font-medium">Reporter</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No incidents match these filters.
                </td>
              </tr>
            )}
            {filtered.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {fmt(i.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{INCIDENT_LABEL[i.incident_type]}</span>
                    {i.is_sos && (
                      <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">
                        SOS
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        SEVERITY_BADGE[i.severity],
                      )}
                    >
                      {SEVERITY_LABEL[i.severity]}
                    </span>
                  </div>
                  {i.note && <p className="mt-1 max-w-md text-muted-foreground">{i.note}</p>}
                  {(i.location_text || i.lat != null) && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {i.location_text ?? `${i.lat?.toFixed(4)}, ${i.lng?.toFixed(4)}`}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">{i.reporter_name ?? "Unknown"}</span>
                  {i.reporter_department && (
                    <p className="text-xs text-muted-foreground">{i.reporter_department}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      STATUS_BADGE[i.status],
                    )}
                  >
                    {STATUS_LABEL[i.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {i.status === "resolved" ? (
                    <>
                      <div>{fmt(i.resolved_at)}</div>
                      {i.resolved_by_name && (
                        <div className="text-xs">by {i.resolved_by_name}</div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
