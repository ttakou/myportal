import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getContinuousConfig } from "@/lib/continuous";
import { ContinuousSettingsForm } from "../_components/continuous-settings-form";

export default async function ContinuousSettingsPage() {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">Continuous-performance settings are managed by HR.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const config = await getContinuousConfig();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Continuous performance</h1>
        <p className="text-muted-foreground">
          Configure the lightweight activities used between formal appraisal cycles.
        </p>
      </div>

      <ContinuousSettingsForm config={config} />
    </div>
  );
}
