import { describe, expect, it } from "vitest";
import { filterOptions, normalizeLabel } from "@/lib/option-filter";

/** Labels shaped like the bed-board / cabin-owner pickers. */
const PEOPLE = [
  "KOM KOM",
  "Mamoudou.Ousmanou",
  "NYETAM ALEXANDRE",
  "Ngaléu Louis — move from Door 4",
  "Nkodo Mebara — move from Door 3",
  "Bella Joseph",
  "BIKOUN SAMUEL",
];

const label = (s: string) => s;

describe("normalizeLabel", () => {
  it("lowercases and strips accents so either spelling matches", () => {
    expect(normalizeLabel("Ngaléu")).toBe("ngaleu");
    expect(normalizeLabel("  NYETAM  ")).toBe("nyetam");
  });
});

describe("filterOptions", () => {
  it("returns everything when the query is empty", () => {
    const { matches, total } = filterOptions(PEOPLE, "", label, 50);
    expect(total).toBe(PEOPLE.length);
    expect(matches).toHaveLength(PEOPLE.length);
  });

  it("matches anywhere in the label, not just the start", () => {
    // A native <select> only jumps on a prefix — this is the reason for the control.
    const { matches } = filterOptions(PEOPLE, "samuel", label, 50);
    expect(matches).toEqual(["BIKOUN SAMUEL"]);
  });

  it("ignores case", () => {
    expect(filterOptions(PEOPLE, "kom", label, 50).matches).toEqual(["KOM KOM"]);
    expect(filterOptions(PEOPLE, "KOM", label, 50).matches).toEqual(["KOM KOM"]);
  });

  it("matches an accented name typed without accents", () => {
    const { matches } = filterOptions(PEOPLE, "ngaleu", label, 50);
    expect(matches).toEqual(["Ngaléu Louis — move from Door 4"]);
  });

  it("requires every term but allows any order", () => {
    const { matches } = filterOptions(PEOPLE, "door nkodo", label, 50);
    expect(matches).toEqual(["Nkodo Mebara — move from Door 3"]);
  });

  it("narrows to the people currently in one room via the move-from suffix", () => {
    const { matches } = filterOptions(PEOPLE, "door 3", label, 50);
    expect(matches).toEqual(["Nkodo Mebara — move from Door 3"]);
  });

  it("returns no matches rather than throwing on an unknown name", () => {
    expect(filterOptions(PEOPLE, "zzz", label, 50)).toEqual({ matches: [], total: 0 });
  });

  it("caps the rendered rows but still reports the full count", () => {
    const many = Array.from({ length: 300 }, (_, i) => `Person ${i}`);
    const { matches, total } = filterOptions(many, "person", label, 50);
    expect(matches).toHaveLength(50);
    expect(total).toBe(300);
  });

  it("treats extra whitespace between terms as one separator", () => {
    const { matches } = filterOptions(PEOPLE, "  bella   joseph  ", label, 50);
    expect(matches).toEqual(["Bella Joseph"]);
  });

  it("works on object options through the label accessor", () => {
    const rows = [
      { id: "a", name: "Bella Joseph" },
      { id: "b", name: "KOM KOM" },
    ];
    const { matches } = filterOptions(rows, "bella", (r) => r.name, 50);
    expect(matches).toEqual([{ id: "a", name: "Bella Joseph" }]);
  });
});
