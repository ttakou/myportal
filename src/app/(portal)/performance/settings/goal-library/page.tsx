import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getGoalTemplates } from "@/lib/goal-templates";
import { GoalLibraryManager } from "../_components/goal-library-manager";

export default async function GoalLibraryPage() {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">The goal library is managed by HR.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const templates = await getGoalTemplates();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Goal library</h1>
        <p className="text-muted-foreground">
          Reusable corporate, department, team and individual goals — each with a measurement type —
          that employees can pick from and cascade.
        </p>
      </div>

      <GoalLibraryManager templates={templates} />
    </div>
  );
}
