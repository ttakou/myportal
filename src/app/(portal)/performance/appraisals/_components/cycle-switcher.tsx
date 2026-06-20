import Link from "next/link";
import type { AppraisalCycle } from "@/types/appraisal";

/** The gate/phase within a year — the cycle name minus its leading year, e.g.
 * "2026 Annual Appraisal - Calibration" → "Calibration". Falls back to the
 * remainder (or "Annual") so unusual names still read sensibly. */
function gateLabel(c: AppraisalCycle): string {
  const stripped = c.name.replace(new RegExp(`^\\s*${c.year}\\s*`), "").trim();
  const parts = stripped.split(/\s+[-–—]\s+/);
  if (parts.length > 1) return parts.slice(1).join(" – ").trim();
  return stripped || "Annual";
}

const STATUS_BADGE: Record<AppraisalCycle["status"], { label: string; cls: string }> = {
  active: { label: "Current", cls: "bg-green-100 text-green-700" },
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-700" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground" },
};

/**
 * Cycle navigation for appraisals. Cycles are grouped under their year, with one
 * chip per gate/phase (annual, mid-year, calibration, final review…) so several
 * cycles in the same year read as gates of that year rather than separate years.
 * Clicking a gate reloads the page for that cycle via `?cycle=`. Presentational.
 */
export function CycleSwitcher({
  cycles,
  selectedId,
}: {
  cycles: AppraisalCycle[];
  selectedId: string | null;
}) {
  if (cycles.length === 0) return null;

  // Group by year (newest first); gates within a year ordered by their period.
  const byYear = new Map<number, AppraisalCycle[]>();
  for (const c of cycles) {
    const list = byYear.get(c.year);
    if (list) list.push(c);
    else byYear.set(c.year, [c]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  for (const y of years) {
    byYear
      .get(y)!
      .sort(
        (a, b) =>
          a.period_start.localeCompare(b.period_start) || a.name.localeCompare(b.name),
      );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Appraisal cycle
      </p>
      <div className="space-y-3">
        {years.map((year) => (
          <div key={year} className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">{year}</p>
            <div className="flex flex-wrap gap-2">
              {byYear.get(year)!.map((c) => {
                const selected = c.id === selectedId;
                const badge = STATUS_BADGE[c.status];
                return (
                  <Link
                    key={c.id}
                    href={`/performance/appraisals?cycle=${c.id}`}
                    aria-current={selected ? "page" : undefined}
                    title={c.name}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                      selected
                        ? "border-primary bg-primary/5 font-medium text-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <span className="max-w-[16rem] truncate">{gateLabel(c)}</span>
                    {badge && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
