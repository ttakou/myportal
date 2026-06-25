import type { CSSProperties } from "react";

/**
 * A notary-/award-style embossed medallion stamp rendered as inline SVG so it
 * prints crisply on statements and report slips. Metallic look (serrated edge,
 * double ring, curved top/bottom legends, stars and a centred banner) tinted to
 * a base colour — pass the tenant's brand colour, or a gold like "#C9A227" for
 * the classic seal.
 */

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [201, 162, 39]; // gold fallback
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a: number[], b: number[], t: number): string {
  return `rgb(${clamp(a[0] + (b[0] - a[0]) * t)}, ${clamp(a[1] + (b[1] - a[1]) * t)}, ${clamp(a[2] + (b[2] - a[2]) * t)})`;
}
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/** Points for a cog/serrated ring: alternating outer/inner radius around a circle. */
function teeth(cx: number, cy: number, outer: number, inner: number, count: number): string {
  const total = count * 2;
  const pts: string[] = [];
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Points for a 5-point star centred at (cx,cy). */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  let rot = -Math.PI / 2;
  const step = Math.PI / 5;
  for (let i = 0; i < 5; i++) {
    pts.push(`${(cx + Math.cos(rot) * outer).toFixed(2)},${(cy + Math.sin(rot) * outer).toFixed(2)}`);
    rot += step;
    pts.push(`${(cx + Math.cos(rot) * inner).toFixed(2)},${(cy + Math.sin(rot) * inner).toFixed(2)}`);
    rot += step;
  }
  return pts.join(" ");
}

export function MedallionStamp({
  color = "#C9A227",
  topText,
  bottomText,
  centerText = "VERIFIED",
  subText,
  size = 132,
  className,
  style,
}: {
  color?: string;
  topText?: string;
  bottomText?: string;
  centerText?: string;
  subText?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const base = parseHex(color);
  const light = mix(base, WHITE, 0.5);
  const lighter = mix(base, WHITE, 0.78);
  const dark = mix(base, BLACK, 0.3);
  const darker = mix(base, BLACK, 0.55);
  const ink = mix(base, BLACK, 0.5);

  const uid = `${color}${centerText}${topText ?? ""}`.replace(/[^a-z0-9]/gi, "").slice(0, 14) || "stamp";
  const gradId = `med-grad-${uid}`;
  const sheenId = `med-sheen-${uid}`;
  const topId = `med-top-${uid}`;
  const botId = `med-bot-${uid}`;

  const cx = 110;
  const cy = 110;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      className={className}
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact", ...style } as CSSProperties}
      aria-label={`${centerText} stamp`}
      role="img"
    >
      <defs>
        <linearGradient id={gradId} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={lighter} />
          <stop offset="22%" stopColor={mix(base, WHITE, 0.15)} />
          <stop offset="45%" stopColor={light} />
          <stop offset="58%" stopColor={mix(base, WHITE, 0.2)} />
          <stop offset="80%" stopColor={dark} />
          <stop offset="100%" stopColor={darker} />
        </linearGradient>
        <radialGradient id={sheenId} cx="34%" cy="28%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.65)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <path id={topId} d={`M ${cx} ${cy} m -80 0 a 80 80 0 1 1 160 0`} fill="none" />
        <path id={botId} d={`M ${cx - 80} ${cy} a 80 80 0 0 0 160 0`} fill="none" />
      </defs>

      {/* Serrated metal edge + disc */}
      <polygon
        points={teeth(cx, cy, 105, 93, 44)}
        fill={`url(#${gradId})`}
        stroke={darker}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx={cx} cy={cy} r="93" fill={`url(#${gradId})`} stroke={darker} strokeWidth="0.75" />
      <circle cx={cx} cy={cy} r="93" fill={`url(#${sheenId})`} />

      {/* Rings */}
      <circle cx={cx} cy={cy} r="85" fill="none" stroke={ink} strokeWidth="1.25" />
      <circle cx={cx} cy={cy} r="68" fill="none" stroke={ink} strokeWidth="1" />

      {/* Curved legends */}
      {topText && (
        <text fill={ink} fontSize="13" fontWeight="700" letterSpacing="1.5" fontFamily="Georgia, 'Times New Roman', serif">
          <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
            {topText.toUpperCase()}
          </textPath>
        </text>
      )}
      {bottomText && (
        <text fill={ink} fontSize="11" fontWeight="600" letterSpacing="2" fontFamily="Georgia, 'Times New Roman', serif">
          <textPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
            {bottomText.toUpperCase()}
          </textPath>
        </text>
      )}

      {/* Stars between the legends and the banner */}
      {[88, 110, 132].map((x) => (
        <polygon key={`t${x}`} points={star(x, 64, 5, 2)} fill={ink} />
      ))}
      {[88, 110, 132].map((x) => (
        <polygon key={`b${x}`} points={star(x, 156, 5, 2)} fill={ink} />
      ))}

      {/* Centre banner */}
      <g transform={`rotate(-13 ${cx} ${cy})`}>
        <line x1={cx - 78} y1={cy - 16} x2={cx + 78} y2={cy - 16} stroke={ink} strokeWidth="1.25" />
        <line x1={cx - 78} y1={cy + 16} x2={cx + 78} y2={cy + 16} stroke={ink} strokeWidth="1.25" />
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          fill={darker}
          fontSize="22"
          fontWeight="800"
          letterSpacing="1"
          fontFamily="Georgia, 'Times New Roman', serif"
        >
          {centerText.toUpperCase()}
        </text>
      </g>

      {subText && (
        <text x={cx} y={cy + 40} textAnchor="middle" fill={ink} fontSize="9" letterSpacing="0.5">
          {subText}
        </text>
      )}
    </svg>
  );
}
