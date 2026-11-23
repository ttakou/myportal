import { describe, expect, it } from "vitest";
import { canUndoMobilisation, movesPeopleNow, siteDateOf } from "@/lib/offshore/undo-mobilise";

const TODAY = "2026-11-23";

describe("a manifest moves people only on its day", () => {
  it("moves them for today or a past day, never for a later day", () => {
    expect(movesPeopleNow("2026-11-23", TODAY)).toBe(true);
    expect(movesPeopleNow("2026-11-22", TODAY)).toBe(true);
    expect(movesPeopleNow("2026-11-24", TODAY)).toBe(false);
    expect(movesPeopleNow("", TODAY)).toBe(false);
  });
});

describe("undoing a mobilisation", () => {
  const trip = (over: Partial<{ status: string; mobilize_date: string; created_at: string }>) => ({
    status: "onboard",
    mobilize_date: "2026-11-10",
    created_at: "2026-11-10T04:00:00Z",
    ...over,
  });

  it("is allowed the same day: mobilised for today, or entered today", () => {
    expect(canUndoMobilisation(trip({ mobilize_date: TODAY, created_at: "2026-11-23T10:10:52Z" }), TODAY)).toBe(true);
    expect(canUndoMobilisation(trip({ mobilize_date: "2026-11-24" }), TODAY)).toBe(true);
    expect(canUndoMobilisation(trip({ created_at: "2026-11-23T09:00:00Z" }), TODAY)).toBe(true);
  });

  it("is not offered for someone aboard since an earlier day, or no longer aboard", () => {
    expect(canUndoMobilisation(trip({}), TODAY)).toBe(false);
    expect(canUndoMobilisation(trip({ mobilize_date: TODAY, status: "demobilised" }), TODAY)).toBe(false);
  });

  it("reads the entry time on the site's clock", () => {
    // 23:30 UTC on the 22nd is already the 23rd in Douala (UTC+1).
    expect(siteDateOf("2026-11-22T23:30:00Z")).toBe("2026-11-23");
    expect(siteDateOf("2026-11-22T22:30:00Z")).toBe("2026-11-22");
  });
});
