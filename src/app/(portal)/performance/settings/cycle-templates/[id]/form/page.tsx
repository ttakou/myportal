import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getTemplateConfig } from "@/lib/cycle-templates";
import type { FormSection } from "@/types/form-section";
import { FormBuilder } from "../../../_components/form-builder";

export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const { id } = await params;
  const tpl = await getTemplateConfig(id);
  if (!tpl) notFound();
  const sections = Array.isArray(tpl.config.sections) ? (tpl.config.sections as FormSection[]) : [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/settings/cycle-templates"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Cycle templates
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Form — {tpl.name}</h1>
        <p className="text-muted-foreground">
          Build the appraisal form from sections. Control order, weight, who sees and edits each,
          and conditional display.
        </p>
      </div>

      <FormBuilder templateId={id} initial={sections} />
    </div>
  );
}
