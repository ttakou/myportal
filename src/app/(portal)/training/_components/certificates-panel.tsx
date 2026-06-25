"use client";

import { useState } from "react";
import { Award, Upload, Download } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Certificate } from "@/types/training";
import { uploadCertificate } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const CERT_STYLE: Record<Certificate["status"], string> = {
  valid: "bg-green-100 text-green-700",
  expiring: "bg-amber-100 text-amber-700",
  expired: "bg-destructive/10 text-destructive",
};

function fmtDate(d: string | null) {
  return d ? new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function CertificatesPanel({
  items,
  courses,
}: {
  items: Certificate[];
  courses: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Uploading…");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [completedOn, setCompletedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [certNo, setCertNo] = useState("");
  const [certUrl, setCertUrl] = useState("");

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await uploadCertificate({
        courseId,
        completedOn,
        expiresOn: expiresOn || null,
        certificateNo: certNo,
        certificateUrl: certUrl,
      });
      if (!res.ok) setError(res.error ?? "Failed.");
      else {
        setOpen(false);
        setCourseId("");
        setCompletedOn("");
        setExpiresOn("");
        setCertNo("");
        setCertUrl("");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Award className="h-5 w-5 text-primary" /> Certificates
          </h2>
          <p className="text-sm text-muted-foreground">{items.length} certificate(s) on record</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Upload className="mr-1 h-4 w-4" /> Upload certificate
        </Button>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {open && (
        <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Course
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
              <option value="">— choose course —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Completed on
            <input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
          </label>
          <label className="text-xs text-muted-foreground">
            Expires on (optional)
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
          </label>
          <label className="text-xs text-muted-foreground">
            Certificate # (optional)
            <input value={certNo} onChange={(e) => setCertNo(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">
            Certificate link / URL (optional)
            <input value={certUrl} onChange={(e) => setCertUrl(e.target.value)} placeholder="https://…" className={cn(field, "mt-0.5 block w-full")} />
          </label>
          <div className="flex items-end sm:col-span-2">
            <Button size="sm" disabled={pending || !courseId || !completedOn} onClick={submit}>
              Upload
            </Button>
            <span className="ml-3 self-center text-xs text-muted-foreground">
              Self-uploaded certificates are held for HR verification before they count toward compliance.
            </span>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No certificates recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Completed</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 font-medium">Certificate</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    {c.course_title}
                    {c.source === "self" && !c.verified && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">unverified</span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(c.completed_on)}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(c.expires_on)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.certificate_url ? (
                      <a
                        href={c.certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" /> {c.certificate_no || "Download"}
                      </a>
                    ) : (
                      c.certificate_no || "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CERT_STYLE[c.status])}>
                      {c.status === "valid" ? "Valid" : c.status === "expiring" ? "Expiring" : "Expired"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
