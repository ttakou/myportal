/**
 * Group visits: a delegation typed as one line per person, and the rows a
 * group makes on the board. Pure.
 */

export interface GroupMember {
  full_name: string;
  id_document_number: string | null;
  phone: string | null;
}

/**
 * One person per line: "Name, ID number, phone" — the ID and phone are
 * optional and may come in either order (a phone is mostly digits). Blank
 * lines are skipped, duplicates by name and ID kept once.
 */
export function parseGroupMembers(text: string): GroupMember[] {
  const seen = new Set<string>();
  const out: GroupMember[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw
      .split(/[,;\t]/)
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (parts.length === 0) continue;
    const [full_name, ...rest] = parts;
    let id_document_number: string | null = null;
    let phone: string | null = null;
    for (const p of rest) {
      const digits = p.replace(/\D/g, "");
      const looksLikePhone = digits.length >= 8 && /^[+\d][\d\s().-]*$/.test(p);
      if (!phone && looksLikePhone) phone = p;
      else if (!id_document_number) id_document_number = p;
    }
    const key = `${full_name.toLowerCase()}|${(id_document_number ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ full_name, id_document_number, phone });
  }
  return out;
}

export interface Grouped<T> {
  /** Visitors in display order: group members adjacent, in registration order. */
  ordered: T[];
  /** The group each visitor id opens, when it is the first of its group. */
  headerFor: Map<string, T[]>;
}

/** Put group members next to each other and mark where each group starts. */
export function groupVisitors<T extends { id: string; group_id: string | null }>(visitors: T[]): Grouped<T> {
  const byGroup = new Map<string, T[]>();
  for (const v of visitors) if (v.group_id) byGroup.set(v.group_id, [...(byGroup.get(v.group_id) ?? []), v]);
  const placed = new Set<string>();
  const ordered: T[] = [];
  const headerFor = new Map<string, T[]>();
  for (const v of visitors) {
    if (placed.has(v.id)) continue;
    if (v.group_id && byGroup.has(v.group_id)) {
      const members = byGroup.get(v.group_id) as T[];
      headerFor.set(v.id, members);
      for (const m of members) {
        ordered.push(m);
        placed.add(m.id);
      }
    } else {
      ordered.push(v);
      placed.add(v.id);
    }
  }
  return { ordered, headerFor };
}
