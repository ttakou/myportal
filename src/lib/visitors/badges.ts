/**
 * The badge pool: which physical badges exist, which are out on someone's
 * lanyard, which came back. Pure.
 */

export interface BadgeLite {
  id: string;
  number: string;
  is_active: boolean;
}

export interface BadgeHolder {
  id: string;
  full_name: string;
  badge_no: string | null;
}

/**
 * Badge numbers typed as a list or a range: "V001-V050", "12-20", "A, B,
 * C". A range keeps the prefix and the zero padding of its ends.
 */
export function parseBadgeNumbers(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: string) => {
    const k = n.trim();
    if (k && !seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase());
      out.push(k);
    }
  };
  for (const piece of text.split(/[,;\n]/)) {
    const p = piece.trim();
    if (!p) continue;
    const m = /^([A-Za-z]*)(\d+)\s*[-–]\s*([A-Za-z]*)(\d+)$/.exec(p);
    if (m && (m[3] === "" || m[3].toLowerCase() === m[1].toLowerCase())) {
      const from = Number(m[2]);
      const to = Number(m[4]);
      if (to >= from && to - from <= 500) {
        // Padding follows the start of the range: "V001-V050" pads, "8-10" does not.
        const width = m[2].length;
        for (let i = from; i <= to; i++) push(`${m[1]}${String(i).padStart(width, "0")}`);
        continue;
      }
    }
    push(p);
  }
  return out;
}

export interface BadgeBoard {
  /** Active badges in the pool. */
  total: number;
  /** Badge numbers on someone currently on site, with the holder. */
  out: { number: string; holder: BadgeHolder }[];
  /** Active pool badges nobody has right now, in pool order. */
  free: string[];
  /** Badges in use that are not in the pool at all (typed by hand). */
  unlisted: string[];
}

/** Match the pool against who is on site. Numbers compare case-insensitively. */
export function badgeBoard(pool: BadgeLite[], onSite: BadgeHolder[]): BadgeBoard {
  const active = pool.filter((b) => b.is_active);
  const holders = new Map<string, BadgeHolder>();
  for (const v of onSite) if (v.badge_no?.trim()) holders.set(v.badge_no.trim().toLowerCase(), v);
  const out: BadgeBoard["out"] = [];
  const free: string[] = [];
  const known = new Set<string>();
  for (const b of active) {
    const key = b.number.toLowerCase();
    known.add(key);
    const holder = holders.get(key);
    if (holder) out.push({ number: b.number, holder });
    else free.push(b.number);
  }
  const unlisted = [...holders.entries()].filter(([k]) => !known.has(k)).map(([, v]) => v.badge_no as string);
  return { total: active.length, out, free, unlisted };
}
