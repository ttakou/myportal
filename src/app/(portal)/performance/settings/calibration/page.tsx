import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { getCalibrationGroups, getCalibrationSettings } from "@/lib/calibration";
import { CalibrationManager } from "../_components/calibration-manager";

export default async function CalibrationSettingsPage() {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">Calibration settings are managed by HR.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const supabase = createClient();
  const [settings, groups, cyclesRes] = await Promise.all([
    getCalibrationSettings(),
    getCalibrationGroups(),
    // Calibration runs only after a cycle is closed for the year, so only
    // closed cycles can be calibrated.
    supabase
      .from("appraisal_cycles")
      .select("id, name, year")
      .eq("status", "closed")
      .order("year", { ascending: false }),
  ]);
  const cycles = ((cyclesRes.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? c.year ?? ""),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Calibration</h1>
        <p className="text-muted-foreground">
          Distribution rules, adjustment limits, approval authority and confidentiality — plus
          calibration groups per cycle.
        </p>
        <Link
          href="/performance/calibration"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open calibration session →
        </Link>
      </div>

      <CalibrationManager settings={settings} groups={groups} cycles={cycles} />
    </div>
  );
}
