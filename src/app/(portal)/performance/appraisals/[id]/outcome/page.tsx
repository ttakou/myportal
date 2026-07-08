import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { getAppraisal } from "@/lib/appraisals";
import { getCachedUser } from "@/lib/auth";
import { getAppraisalCapabilities } from "@/lib/perf-permissions";
import { STATUS_LABEL } from "@/types/appraisal";
import { PrintButton } from "./print-button";
import { ReopenControl } from "./reopen-control";

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default async function AppraisalOutcomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [appraisal, user] = await Promise.all([getAppraisal(id), getCachedUser()]);
  if (!appraisal) notFound();

  // Effective capabilities come from the configurable permission matrix, given
  // how this viewer relates to the appraisal.
  const isSelf = !!user && user.id === appraisal.employee_id;
  const { can } = await getAppraisalCapabilities({
    isSelf,
    isDirectManager: !!user && user.id === appraisal.manager_id,
    isSecondLevel: !!user && user.id === appraisal.second_level_id,
  });

  const canReopen = appraisal.status === "closed" && can("reopen");
  const canExport = can("reports_export") || isSelf;
  // A rating is only final once the calibration panel + PGM have signed off.
  // Until then the figures shown are the line manager's provisional scores.
  const ratingFinal = appraisal.calibration_gate === "final";
  // A score shows to roles entitled to view scores; everyone else (e.g. the
  // employee) only once HR has released the final rating.
  const showScore = can("scores_view") || appraisal.rating_released_at != null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* A4 with sensible margins when saved as PDF / printed. */}
      <style>{"@media print { @page { size: A4; margin: 16mm; } body { -webkit-print-color-adjust: exact; } }"}</style>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/performance/appraisals"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Appraisals
        </Link>
        <div className="flex items-center gap-2">
          {canReopen && <ReopenControl id={id} />}
          {canExport && (
            <a
              href={`/performance/appraisals/${id}/outcome/docx`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              <FileText className="h-4 w-4" /> Download Word
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      <header className="space-y-1 border-b pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Appraisal outcome</h1>
        <p className="text-muted-foreground">
          {appraisal.cycle_name ?? "Appraisal"} · {STATUS_LABEL[appraisal.status]}
        </p>
        {!showScore ? (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground print:bg-transparent print:px-0">
            Final rating pending release by HR
          </p>
        ) : (
          !ratingFinal && (
            <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 print:bg-transparent print:px-0">
              Preliminary — pending calibration &amp; PGM sign-off
            </p>
          )
        )}
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Employee">{appraisal.employee_name ?? "—"}</Field>
        <Field label="Manager">{appraisal.manager_name ?? "—"}</Field>
        {showScore ? (
          <>
            <Field label={ratingFinal ? "Final score" : "Preliminary score"}>
              {appraisal.final_score ?? "—"}
            </Field>
            <Field label={ratingFinal ? "Rating" : "Preliminary rating"}>
              {appraisal.rating_label ?? "—"}
            </Field>
          </>
        ) : (
          <Field label="Rating">Pending release</Field>
        )}
      </section>

      {can("comments_view") && (appraisal.manager_summary || appraisal.employee_summary) && (
        <section className="space-y-3">
          {appraisal.manager_summary && (
            <Field label="Manager summary">
              <p className="whitespace-pre-wrap">{appraisal.manager_summary}</p>
            </Field>
          )}
          {appraisal.employee_summary && (
            <Field label="Employee summary">
              <p className="whitespace-pre-wrap">{appraisal.employee_summary}</p>
            </Field>
          )}
        </section>
      )}

      {appraisal.goals.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Objectives</h2>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Objective</th>
                <th className="py-1.5 font-medium">Weight</th>
                <th className="py-1.5 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appraisal.goals.map((g) => (
                <tr key={g.id}>
                  <td className="py-1.5 pr-2">{g.title}</td>
                  <td className="py-1.5 tabular-nums">{g.weight != null ? `${g.weight}%` : "—"}</td>
                  <td className="py-1.5 tabular-nums">{g.manager_rating ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {appraisal.competencies.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Competencies</h2>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Competency</th>
                <th className="py-1.5 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appraisal.competencies.map((c) => (
                <tr key={c.competency_id}>
                  <td className="py-1.5 pr-2">{c.name}</td>
                  <td className="py-1.5 tabular-nums">{c.manager_rating ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {appraisal.development_plan.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Development plan</h2>
          <ul className="space-y-1 text-sm">
            {appraisal.development_plan.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.area}</span> — {d.action}
                {d.target_date ? ` (by ${fmtDate(d.target_date)})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
        <Field label="Discussion date">{fmtDate(appraisal.discussion_date)}</Field>
        <Field label="Employee agreed">
          {appraisal.employee_agreed == null ? "—" : appraisal.employee_agreed ? "Yes" : "No"}
        </Field>
        <Field label="Acknowledged">{fmtDate(appraisal.acknowledged_at)}</Field>
        {appraisal.employee_ack_comment && (
          <div className="col-span-2 sm:col-span-3">
            <Field label="Employee comment">
              <p className="whitespace-pre-wrap">{appraisal.employee_ack_comment}</p>
            </Field>
          </div>
        )}
      </section>

      {/* Signature block for the signed copy. */}
      <section className="grid grid-cols-2 gap-8 pt-8">
        <Signature role="Employee" name={appraisal.employee_name} />
        <Signature role="Manager" name={appraisal.manager_name} />
      </section>
      <p className="text-right text-[11px] text-muted-foreground">
        Generated {new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </p>
    </div>
  );
}

function Signature({ role, name }: { role: string; name: string | null }) {
  return (
    <div className="space-y-6">
      <div className="border-b border-foreground/40" />
      <div className="text-xs text-muted-foreground">
        {role}
        {name ? ` — ${name}` : ""} · Signature &amp; date
      </div>
    </div>
  );
}
