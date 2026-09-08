import { describe, expect, it } from "vitest";
import { bedNumber, freeBedsFor, lowestFreeBed, staysOverlap } from "@/lib/offshore/bed-availability";

describe("staysOverlap", () => {
  it("shares a day or not", () => {
    expect(staysOverlap({ from: "2026-09-10", to: "2026-09-12" }, { from: "2026-09-12", to: "2026-09-15" })).toBe(true);
    expect(staysOverlap({ from: "2026-09-10", to: "2026-09-12" }, { from: "2026-09-13", to: "2026-09-15" })).toBe(false);
  });

  it("treats an open end as never ending", () => {
    expect(staysOverlap({ from: "2026-09-01", to: null }, { from: "2026-12-01", to: "2026-12-02" })).toBe(true);
    expect(staysOverlap({ from: "2026-09-10", to: null }, { from: "2026-09-01", to: "2026-09-09" })).toBe(false);
  });
});

describe("freeBedsFor", () => {
  it("counts only occupants whose stay overlaps, never owners", () => {
    const stay = { from: "2026-09-10", to: "2026-09-12" };
    const occupants = [
      { from: "2026-09-01", to: "2026-09-28" }, // on board through the stay
      { from: "2026-09-13", to: "2026-09-20" }, // arrives after
      { from: "2026-08-01", to: null }, // open-ended, still there
    ];
    expect(freeBedsFor(12, occupants, stay)).toBe(10);
  });

  it("never goes below zero", () => {
    const stay = { from: "2026-09-10", to: "2026-09-10" };
    expect(freeBedsFor(1, [{ from: "2026-09-10", to: null }, { from: "2026-09-10", to: null }], stay)).toBe(0);
  });
});

describe("lowestFreeBed", () => {
  it("gives the lowest berth not in use", () => {
    expect(lowestFreeBed(4, ["Bed 1", "Bed 3"])).toBe("Bed 2");
    expect(lowestFreeBed(4, [])).toBe("Bed 1");
    expect(lowestFreeBed(2, ["Bed 1", "Bed 2"])).toBeNull();
  });

  it("ignores labels that do not name a berth", () => {
    expect(bedNumber("bed 7")).toBe(7);
    expect(bedNumber("T")).toBeNull();
    expect(bedNumber("13")).toBeNull();
    expect(lowestFreeBed(2, ["T", null, "13"])).toBe("Bed 1");
  });
});
