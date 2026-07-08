import { cn } from "@/lib/utils";

/**
 * Daily gate traffic — a stacked bar per day (staff / contractor / visitor
 * entries). Server-rendered SVG: no client JS, prints exactly as shown.
 *
 * Colors follow the entity, matching the register's type badges, and were
 * checked with the dataviz palette validator for both modes:
 *   light  #dc2626 / #f59e0b / #0ea5e9  (CVD ΔE 31, all checks pass)
 *   dark   #ef4444 / #d97706 / #0284c7  (all checks pass)
 * Identity is never color-alone: the legend names each series and every
 * segment carries a native tooltip; the register table below is the data view.
 */

type Day = { date: string; staff: number; contractor: number; visitor: number };
const SERIES = ["staff", "contractor", "visitor"] as const;
const LABEL = { staff: "Staff", contractor: "Contractors", visitor: "Visitors" } as const;
// CSS vars so the same markup re-colors under `.dark` (Tailwind class mode).
const VAR = {
  staff: "var(--ar-staff, #dc2626)",
  contractor: "var(--ar-contractor, #f59e0b)",
  visitor: "var(--ar-visitor, #0ea5e9)",
} as const;

const W = 960;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };

/** A friendly rounded max for the y axis, close above the data peak. */
function niceMax(n: number): number {
  if (n <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * pow >= n) return Math.round(m * pow);
  }
  return 10 * pow;
}

export function DailyTrafficChart({ days, className }: { days: Day[]; className?: string }) {
  const total = days.reduce((s, d) => s + d.staff + d.contractor + d.visitor, 0);
  if (days.length < 2 || total === 0) return null;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...days.map((d) => d.staff + d.contractor + d.visitor)));
  const step = innerW / days.length;
  const barW = Math.max(2, Math.min(22, step - 2)); // thin marks, ≥2px gap between bars
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  // Label every nth day so long periods don't collide.
  const every = Math.ceil(days.length / Math.min(days.length, 12));
  const gridVals = [0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <style>{`
        .ar-chart { --ar-staff:#dc2626; --ar-contractor:#f59e0b; --ar-visitor:#0ea5e9; }
        .dark .ar-chart { --ar-staff:#ef4444; --ar-contractor:#d97706; --ar-visitor:#0284c7; }
        @media print { .ar-chart svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `}</style>
      <div className="ar-chart">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Daily gate traffic</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {SERIES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: VAR[s] }}
                />
                {LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Gate entries per day from ${days[0].date} to ${days[days.length - 1].date}`}
        >
          {/* Recessive grid + y labels */}
          {gridVals.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="currentColor"
                strokeOpacity={0.12}
              />
              <text
                x={PAD.left - 6}
                y={y(v) + 3.5}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
                fillOpacity={0.55}
              >
                {v}
              </text>
            </g>
          ))}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(0)}
            y2={y(0)}
            stroke="currentColor"
            strokeOpacity={0.3}
          />

          {days.map((d, i) => {
            const x = PAD.left + i * step + (step - barW) / 2;
            const dayTotal = d.staff + d.contractor + d.visitor;
            let cursor = 0;
            const segs = SERIES.map((s) => {
              const v = d[s];
              const y1 = y(cursor + v);
              const h = y(cursor) - y1;
              cursor += v;
              return { s, v, y1, h };
            }).filter((seg) => seg.v > 0);
            const topIdx = segs.length - 1;
            return (
              <g key={d.date}>
                <title>{`${d.date} — ${dayTotal} entr${dayTotal === 1 ? "y" : "ies"}: ${d.staff} staff, ${d.contractor} contractor${d.contractor === 1 ? "" : "s"}, ${d.visitor} visitor${d.visitor === 1 ? "" : "s"}`}</title>
                {segs.map((seg, j) => (
                  <rect
                    key={seg.s}
                    x={x}
                    y={seg.y1}
                    width={barW}
                    height={Math.max(seg.h, 1)}
                    fill={VAR[seg.s]}
                    // 4px rounded data-end on the topmost segment only; 2px
                    // surface gap between stacked segments via a card stroke.
                    rx={j === topIdx ? 3 : 0}
                    stroke="hsl(var(--card))"
                    strokeWidth={j > 0 ? 2 : 0}
                  />
                ))}
                {i % every === 0 && (
                  <text
                    x={x + barW / 2}
                    y={H - PAD.bottom + 14}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill="currentColor"
                    fillOpacity={0.55}
                  >
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
