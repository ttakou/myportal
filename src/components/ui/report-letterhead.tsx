import { type CSSProperties } from "react";
import { getTenantBranding } from "@/lib/branding";
import { MedallionStamp } from "@/components/ui/medallion-stamp";

const EXACT: CSSProperties = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };
const SOFTWARE_NAME = "MyEnterprisePortal";

/**
 * Shared, branded report letterhead — the same masthead the savings statement
 * uses, so every module's printable report reads as one official document:
 * tenant logo + name + address on the left, the report title / filters /
 * generated-at on the right, over a brand-coloured rule (print-colour exact).
 * Page size is left to each report (A4 by default; wide reports keep their
 * own A3 @page).
 */
export async function ReportHeader({
  title,
  subtitle,
  meta = [],
}: {
  title: string;
  subtitle?: string;
  meta?: string[];
}) {
  const branding = await getTenantBranding();
  const generated = new Date().toLocaleString("en-GB", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const addressLines = branding.addressLines ?? [];

  return (
    <header
      className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b-2 pb-4"
      style={{ borderColor: branding.primary, ...EXACT }}
    >
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt={branding.name}
            className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
          />
        ) : (
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white sm:h-16 sm:w-16"
            style={{ backgroundColor: branding.primary, ...EXACT }}
          >
            {branding.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <h1
            className="text-xl font-extrabold uppercase leading-tight tracking-tight sm:text-2xl"
            style={{ color: branding.primary }}
          >
            {branding.name}
          </h1>
          {(addressLines.length > 0 || branding.contact) && (
            <div className="mt-0.5 text-[11px] leading-snug text-neutral-600">
              {addressLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              {branding.contact && <p>{branding.contact}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="text-right">
        <p className="text-base font-semibold uppercase tracking-tight text-neutral-700 sm:text-lg">
          {title}
        </p>
        {subtitle && <p className="max-w-md text-xs text-neutral-500">{subtitle}</p>}
        {meta.length > 0 && <p className="text-xs text-neutral-500">{meta.join(" · ")}</p>}
        <p className="text-xs text-neutral-400">Generated {generated} (UTC)</p>
      </div>
    </header>
  );
}

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
