import { describe, expect, it } from "vitest";
import { hasExpired, postponedKind } from "@/lib/offshore/movement-change";

describe("an undecided date change expires", () => {
  it("once the night run of its first day has gone", () => {
    // Celestin: late demob 24 → 26 Nov, never decided; he left with his crew on the 24th.
    const r = { status: "pending" as const, scheduled_date: "2026-11-24", requested_date: "2026-11-26" };
    expect(hasExpired(r, "2026-11-23")).toBe(false);
    expect(hasExpired(r, "2026-11-24")).toBe(true);
  });

  it("dates an early move from the requested day, and a first demob date from its only date", () => {
    expect(hasExpired({ status: "pending_endorsement", scheduled_date: "2026-12-10", requested_date: "2026-12-05" }, "2026-12-05")).toBe(true);
    expect(hasExpired({ status: "pending", scheduled_date: null, requested_date: "2026-12-05" }, "2026-12-04")).toBe(false);
  });

  it("never touches a decided or withdrawn request", () => {
    expect(hasExpired({ status: "approved", scheduled_date: "2026-11-01", requested_date: "2026-11-02" }, "2026-11-24")).toBe(false);
    expect(hasExpired({ status: "withdrawn", scheduled_date: "2026-11-01", requested_date: "2026-11-02" }, "2026-11-24")).toBe(false);
  });
});

describe("a postponed run", () => {
  it("gives each traveller a late move of their direction", () => {
    expect(postponedKind("out")).toBe("late_mob");
    expect(postponedKind("in")).toBe("late_demob");
  });
});
