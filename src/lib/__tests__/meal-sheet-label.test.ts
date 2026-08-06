import { describe, expect, it } from "vitest";
import { mealSheetLabel } from "@/lib/offshore/meal-sheet-label";

describe("mealSheetLabel", () => {
  it("labels the sheet by its date", () => {
    expect(mealSheetLabel("2026-06-16", "Juliet").title).toBe("Meal sheet of 16 Jun 2026");
  });

  it("puts the installation and ISO date in the subtitle", () => {
    expect(mealSheetLabel("2026-06-16", "Juliet").subtitle).toBe("Juliet · 2026-06-16");
  });

  it("falls back to the date alone when no installation is given", () => {
    expect(mealSheetLabel("2026-06-16").subtitle).toBe("2026-06-16");
    expect(mealSheetLabel("2026-06-16", "  ").subtitle).toBe("2026-06-16");
  });

  it("builds a filename-safe slug", () => {
    expect(mealSheetLabel("2026-06-16", "Juliet").slug).toBe("meal-sheet-2026-06-16");
  });

  it("reads the date as UTC, so the label never slips a day", () => {
    // A local-time parse could render this as the 15th west of Greenwich.
    expect(mealSheetLabel("2026-01-01").title).toBe("Meal sheet of 01 Jan 2026");
  });

  it("passes a non-ISO value through rather than printing Invalid Date", () => {
    expect(mealSheetLabel("not-a-date").title).toBe("Meal sheet of not-a-date");
  });

  it("keeps the title stable across installations", () => {
    expect(mealSheetLabel("2026-06-16", "Juliet").title).toBe(
      mealSheetLabel("2026-06-16", "RIG").title,
    );
  });
});
