/**
 * Who the Dispatcher can add to a run: everyone in the people database, not
 * only the offshore roster, plus every registered visitor (casual ones
 * included). Each name says where POB has them, so someone missed in POB is
 * easy to spot. Pure: rows in, options out.
 */

export interface Pick {
  /** "p:<profile id>" for a person, "v:<visit request id>" for a visitor. */
  id: string;
  /** The person's name, for messages. */
  name: string;
  /** What the list shows and searches: name, then where they are. */
  label: string;
}

export interface PickPerson {
  id: string;
  name: string;
  onRoster: boolean;
  aboard: boolean;
}

export interface PickVisitor {
  id: string;
  name: string;
  company: string | null;
  status: string;
  /** Newest first wins when a visitor came more than once. */
  created_at: string;
}

export function personNote(p: PickPerson): string {
  return p.aboard ? "on board" : p.onRoster ? "ashore" : "not on the offshore roster";
}

export function travellerPicks(people: PickPerson[], visitors: PickVisitor[]): Pick[] {
  const out: Pick[] = people.map((p) => ({ id: `p:${p.id}`, name: p.name, label: `${p.name} — ${personNote(p)}` }));
  // One entry per visitor name: the latest visit (on board, if one is).
  const latest = new Map<string, PickVisitor>();
  for (const v of [...visitors].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const key = v.name.trim().toLowerCase();
    if (!key) continue;
    const seen = latest.get(key);
    if (!seen || (v.status === "onboard" && seen.status !== "onboard")) latest.set(key, v);
  }
  for (const v of latest.values()) {
    const where = v.status === "onboard" ? "visitor, on board" : "visitor";
    out.push({ id: `v:${v.id}`, name: v.name.trim(), label: `${v.name.trim()} — ${where}${v.company ? ` (${v.company})` : ""}` });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Split a pick id back into what it points at. */
export function parsePick(id: string): { kind: "person" | "visitor"; id: string } | null {
  const m = /^([pv]):([0-9a-f-]{36})$/i.exec(id);
  return m ? { kind: m[1] === "p" ? "person" : "visitor", id: m[2] } : null;
}
