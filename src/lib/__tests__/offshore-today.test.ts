import { describe, expect, it } from "vitest";
import { dueBeforeTonight, firstDayOf, mealTotals, nextDay } from "@/lib/offshore/today";

describe("due before tonight's run", () => {
  it("is anything taking effect tomorrow or earlier", () => {
    expect(nextDay("2026-11-30")).toBe("2026-12-01");
    expect(dueBeforeTonight("2026-11-24", "2026-11-23")).toBe(true);
    expect(dueBeforeTonight("2026-11-23", "2026-11-23")).toBe(true);
    expect(dueBeforeTonight("2026-11-25", "2026-11-23")).toBe(false);
    expect(dueBeforeTonight(null, "2026-11-23")).toBe(false);
  });

  it("dates a date change from the first day it touches", () => {
    expect(firstDayOf("2026-11-24", "2026-11-26")).toBe("2026-11-24"); // late demob
    expect(firstDayOf("2026-11-30", "2026-11-25")).toBe("2026-11-25"); // early demob
    expect(firstDayOf(null, "2026-12-01")).toBe("2026-12-01"); // setting a demob date
  });
});

describe("today's meal count", () => {
  it("adds up the ticks per installation", () => {
    const row = (inst: string, b: boolean, l: boolean) => ({
      installation_id: inst, category: "staff", breakfast: b, snack: false, lunch: l, dinner: true, lodging: true,
    });
    expect(mealTotals([row("J", true, true), row("J", false, true), row("R", true, false)])).toEqual([
      { installation_id: "J", people: 2, breakfast: 1, snack: 0, lunch: 2, dinner: 2, lodging: 2 },
      { installation_id: "R", people: 1, breakfast: 1, snack: 0, lunch: 0, dinner: 1, lodging: 1 },
    ]);
  });
});
