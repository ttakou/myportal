import { getTenantBranding } from "@/lib/branding";
import { MedallionStamp } from "@/components/ui/medallion-stamp";

const SOFTWARE_NAME = "MyEnterprisePortal";

/**
 * Shared report footer — the same branded medallion stamp + "Powered by" line
 * the savings statement uses, so every module's report closes as an official
 * document. Page-size agnostic: A4 and A3 reports share this identical block.
 */
export async function ReportStampFooter({
  label = "Official Report",
  note,
}: {
  /** Banner around the medallion's lower arc. */
  label?: string;
  /** Optional disclaimer line; a sensible default is used otherwise. */
  note?: string;
}) {
  const branding = await getTenantBranding();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-8 space-y-3 break-inside-avoid">
      <div className="flex items-end justify-between gap-4">
        <p className="max-w-md text-[10.5px] leading-snug text-neutral-500">
          {note ??
            "This is a system-generated report and is valid without a handwritten signature."}
        </p>
        <MedallionStamp
          color={branding.primary}
          topText={branding.name}
          bottomText={label}
          centerText="Verified"
          subText={today}
          size={120}
          className="-rotate-12 shrink-0"
        />
      </div>
      <footer className="flex items-center justify-between border-t pt-2 text-[10.5px] text-neutral-500">
        <span>Generated {today} (UTC).</span>
        <span className="whitespace-nowrap">
          Powered by <span className="font-semibold text-neutral-700">{SOFTWARE_NAME}</span>
        </span>
      </footer>
    </div>
  );
}
