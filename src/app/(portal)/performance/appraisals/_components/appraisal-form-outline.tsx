import { Lock, Paperclip, MessageSquare, FileCheck } from "lucide-react";
import { getAppraisalForm } from "@/lib/appraisal-form";

/**
 * Additive: renders the cycle template's configured form sections (role-filtered)
 * as an outline alongside the live appraisal. Nothing renders when the cycle has
 * no configured form.
 */
export async function AppraisalFormOutline({ appraisalId }: { appraisalId: string }) {
  const sections = await getAppraisalForm(appraisalId);
  if (sections.length === 0) return null;

  const totalWeight = sections.reduce((sum, s) => sum + (s.weight || 0), 0);

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Appraisal form</h2>
        {totalWeight > 0 && (
          <span className="text-xs text-muted-foreground">Total weight {totalWeight}%</span>
        )}
      </div>
      <ol className="space-y-2">
        {sections.map((s, i) => (
          <li key={s.key} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {i + 1}
              </span>
              <span className="font-medium text-sm">{s.title}</span>
              {s.weight > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{s.weight}%</span>
              )}
              {s.mandatory && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">required</span>
              )}
              {s.conditional && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">conditional</span>
              )}
              {!s.editableByMe && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" /> read-only
                </span>
              )}
            </div>
            {s.instructions && <p className="mt-1 pl-7 text-sm text-muted-foreground">{s.instructions}</p>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-7 text-xs text-muted-foreground">
              {s.evidenceRequired && (
                <span className="inline-flex items-center gap-1"><FileCheck className="h-3 w-3" /> evidence</span>
              )}
              {s.allowAttachments && (
                <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> attachments</span>
              )}
              {s.allowComments && (
                <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> comments</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
