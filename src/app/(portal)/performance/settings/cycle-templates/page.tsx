import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getCycleTemplates } from "@/lib/cycle-templates";
import { getRatingScales } from "@/lib/rating-scales";
import { CycleTemplatesManager } from "../_components/cycle-templates-manager";

export default async function CycleTemplatesPage() {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">Cycle templates are managed by HR.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const [templates, scales] = await Promise.all([getCycleTemplates(), getRatingScales()]);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Cycle templates</h1>
        <p className="text-muted-foreground">
          Reusable recipes for each kind of review. Launch a cycle from a template to copy its
          defaults.
        </p>
      </div>

      <CycleTemplatesManager
        templates={templates}
        scales={scales.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
