import { getTenantBranding } from "@/lib/branding";

/**
 * Branded report letterhead — the tenant logo (or name) alongside the report
 * title, the filters it was run with, and a generated-at timestamp. Rendered in
 * print output too, so an exported/printed report reads as an official document.
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

  return (
    <div className="space-y-3">
      {/* Tenant colour-theme accent (prints) */}
      <div className="border-t-4 border-brand" />
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-brand">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>}
        <p className="text-xs text-muted-foreground">Generated {generated} (UTC)</p>
      </div>
      <div className="shrink-0 text-right">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt={branding.name}
            className="h-12 w-auto max-w-[200px] object-contain"
          />
        ) : (
          <span className="text-lg font-semibold text-brand">{branding.name}</span>
        )}
        </div>
      </div>
    </div>
  );
}
