import { describe, expect, it } from "vitest";
import { parsePick, travellerPicks } from "@/lib/offshore/traveller-picks";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const V1 = "33333333-3333-3333-3333-333333333333";
const V2 = "44444444-4444-4444-4444-444444444444";

describe("who can be added to a run", () => {
  it("lists everyone in the people database with where POB has them, and each visitor once", () => {
    const picks = travellerPicks(
      [
        { id: A, name: "Amina", onRoster: true, aboard: true },
        { id: B, name: "Bello", onRoster: false, aboard: false },
      ],
      [
        { id: V1, name: "Chen ", company: "Schlumberger", status: "returned", created_at: "2026-10-01" },
        { id: V2, name: "chen", company: "Schlumberger", status: "returned", created_at: "2026-11-01" },
      ],
    );
    expect(picks).toEqual([
      { id: `p:${A}`, name: "Amina", label: "Amina — on board" },
      { id: `p:${B}`, name: "Bello", label: "Bello — not on the offshore roster" },
      { id: `v:${V2}`, name: "chen", label: "chen — visitor (Schlumberger)" },
    ]);
  });

  it("prefers a visitor's visit that is on board", () => {
    const picks = travellerPicks([], [
      { id: V1, name: "Dee", company: null, status: "onboard", created_at: "2026-10-01" },
      { id: V2, name: "Dee", company: null, status: "returned", created_at: "2026-11-01" },
    ]);
    expect(picks).toEqual([{ id: `v:${V1}`, name: "Dee", label: "Dee — visitor, on board" }]);
  });

  it("reads a pick back", () => {
    expect(parsePick(`p:${A}`)).toEqual({ kind: "person", id: A });
    expect(parsePick(`v:${V1}`)).toEqual({ kind: "visitor", id: V1 });
    expect(parsePick("x:1")).toBeNull();
  });
});
