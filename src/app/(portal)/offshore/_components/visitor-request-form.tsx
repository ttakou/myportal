"use client";

import { useState, useTransition } from "react";
import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/types/offshore";
import {
  VISIT_STATUS_LABEL,
  VISITOR_TYPE_LABEL,
  type VisitRequest,
  type VisitorType,
} from "@/types/offshore";
import { createVisitRequest } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/** Host-facing: raise an offshore visit request and track your own. */
export function VisitorRequestForm({
  installations,
  mine,
}: {
  installations: Installation[];
  mine: VisitRequest[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [visitorName, setVisitorName] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<VisitorType>("contractor");
  const [installationId, setInstallationId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [hostName, setHostName] = useState("");
  const [hostDept, setHostDept] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [overnight, setOvernight] = useState(true);
  const [ice, setIce] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createVisitRequest({
        visitorName,
        visitorCompany: company,
        visitorType: type,
        installationId: installationId || undefined,
        purpose,
        hostName,
        hostDepartment: hostDept,
        departDate,
        returnDate: returnDate || undefined,
        overnight,
        emergencyContact: ice,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not submit request.");
        return;
      }
      setVisitorName("");
      setCompany("");
      setPurpose("");
      setHostName("");
      setHostDept("");
      setDepartDate("");
      setReturnDate("");
      setIce("");
      setOpen(false);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Offshore visitor requests</h2>
        <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((o) => !o)}>
          <Plane className="h-4 w-4" /> {open ? "Close" : "Request a visit"}
        </Button>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {open && (
        <form onSubmit={submit} className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} placeholder="Visitor full name" required className={field} />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className={field} />
          <select value={type} onChange={(e) => setType(e.target.value as VisitorType)} className={field}>
            {(Object.keys(VISITOR_TYPE_LABEL) as VisitorType[]).map((t) => (
              <option key={t} value={t}>{VISITOR_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} required className={field}>
            <option value="">Destination installation…</option>
            {installations.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Offshore host" className={field} />
          <input value={hostDept} onChange={(e) => setHostDept(e.target.value)} placeholder="Host department" className={field} />
          <label className="text-xs text-muted-foreground">
            Departure
            <input value={departDate} onChange={(e) => setDepartDate(e.target.value)} type="date" required className={`mt-1 w-full ${field}`} />
          </label>
          <label className="text-xs text-muted-foreground">
            Return
            <input value={returnDate} onChange={(e) => setReturnDate(e.target.value)} type="date" className={`mt-1 w-full ${field}`} />
          </label>
          <input value={ice} onChange={(e) => setIce(e.target.value)} placeholder="Emergency contact" className={field} />
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose of visit" className={`${field} sm:col-span-2`} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={overnight} onChange={(e) => setOvernight(e.target.checked)} />
            Overnight (needs a bed)
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>Submit request</Button>
          </div>
        </form>
      )}

      {mine.length > 0 && (
        <div className="space-y-2">
          {mine.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
              <span className="font-medium">{v.visitor_name}</span>
              <span className="text-xs text-muted-foreground">
                {v.installation_name ?? "—"} · {v.depart_date}
                {v.return_date ? ` → ${v.return_date}` : ""}
              </span>
              {v.allocation && (
                <span className="text-xs text-muted-foreground">· Room {v.allocation.room_label}</span>
              )}
              <span
                className={cn(
                  "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium",
                  v.status === "returned"
                    ? "bg-green-100 text-green-700"
                    : v.status === "rejected" || v.status === "cancelled"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary",
                )}
              >
                {VISIT_STATUS_LABEL[v.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
