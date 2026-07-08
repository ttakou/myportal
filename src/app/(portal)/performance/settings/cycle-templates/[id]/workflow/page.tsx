import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getTemplateConfig } from "@/lib/cycle-templates";
import type { WorkflowStage } from "@/types/workflow";
import { WorkflowDesigner } from "../../../_components/workflow-designer";

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
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
  const stages = Array.isArray(tpl.config.stages) ? (tpl.config.stages as WorkflowStage[]) : [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/settings/cycle-templates"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Cycle templates
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Workflow — {tpl.name}</h1>
        <p className="text-muted-foreground">
          Define the ordered stages, who is responsible, what they can edit, and how the appraisal
          moves between them.
        </p>
      </div>

      <WorkflowDesigner templateId={id} initial={stages} />
    </div>
  );
}
