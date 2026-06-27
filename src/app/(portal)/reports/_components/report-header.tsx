import { type CSSProperties } from "react";
import { getTenantBranding } from "@/lib/branding";

const EXACT: CSSProperties = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };

/**
 * Branded report letterhead — matches the savings statement masthead so every
 * module's report reads as the same official document: tenant logo + name +
 * address on the left, the report title, the filters it was run with and a
 * generated-at timestamp on the right, over a brand-coloured rule. Page size is
 * left to each report (A4 by default; wide reports keep their own A3 @page).
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
