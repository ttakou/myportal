import { describe, it, expect } from "vitest";
import {
  planCampaign,
  clinicDays,
  firstTuesdayOnOrAfter,
  isOnshoreOn,
  rollOffWeekend,
  type CampaignParams,
} from "@/lib/medical-planner";

const base: CampaignParams = {
  startDate: "2026-07-13", // a Monday
  endDate: "2026-08-31",
  capacityPerDay: 2,
  visitGapDays: 3,
};

describe("date helpers", () => {
  it("first clinic day is the first Tuesday on/after start", () => {
    expect(firstTuesdayOnOrAfter("2026-07-13")).toBe("2026-07-14"); // Tue
    expect(firstTuesdayOnOrAfter("2026-07-14")).toBe("2026-07-14");
  });

  it("clinic days are Tuesdays and Thursdays, starting a Tuesday", () => {
    const days = clinicDays(base);
    expect(days[0]).toBe("2026-07-14"); // Tue
    // every clinic day is a Tue (2) or Thu (4)
    for (const d of days) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect([2, 4]).toContain(wd);
    }
  });

  it("rolls weekend dates to Monday", () => {
    expect(rollOffWeekend("2026-07-18")).toBe("2026-07-20"); // Sat → Mon
    expect(rollOffWeekend("2026-07-19")).toBe("2026-07-20"); // Sun → Mon
    expect(rollOffWeekend("2026-07-14")).toBe("2026-07-14"); // Tue unchanged
  });

  it("computes onshore windows from the rotation cycle", () => {
    const crew = { cycleStart: "2026-07-14", offshoreDays: 21, onshoreDays: 21 };
    expect(isOnshoreOn(crew, "2026-07-14")).toBe(false); // day 0 → offshore
    expect(isOnshoreOn(crew, "2026-08-05")).toBe(true); // day 22 → onshore
    expect(isOnshoreOn(null, "2026-07-14")).toBe(true); // no crew → available
  });
});

describe("planCampaign", () => {
  it("places an onshore employee on the first Tuesday, visit 2 at +3", () => {
    const rows = planCampaign(base, [{ profileId: "a", name: "Onshore Al" }]);
    expect(rows[0].status).toBe("ok");
    expect(rows[0].visit1).toBe("2026-07-14");
    expect(rows[0].visit2).toBe("2026-07-17"); // Fri
  });

  it("skips clinic days when the employee is offshore (rotation)", () => {
    // Offshore for 2026-07-14..08-03; onshore from 08-04.
    const crew = { cycleStart: "2026-07-14", offshoreDays: 21, onshoreDays: 21 };
    const rows = planCampaign(base, [{ profileId: "b", name: "Rig Bob", crew }]);
    expect(rows[0].status).toBe("ok");
    expect(isOnshoreOn(crew, rows[0].visit1!)).toBe(true);
    expect(rows[0].visit1! >= "2026-08-04").toBe(true);
  });

  it("hard-blocks a training-conflicting clinic day", () => {
    const rows = planCampaign(base, [
      { profileId: "c", name: "Busy Cara", busyDates: ["2026-07-14"] },
    ]);
    expect(rows[0].visit1).not.toBe("2026-07-14"); // first Tue is blocked
    expect(rows[0].status).toBe("ok");
  });

  it("respects per-day capacity", () => {
    const people = Array.from({ length: 5 }, (_, i) => ({ profileId: `p${i}`, name: `P${i}` }));
    const rows = planCampaign({ ...base, capacityPerDay: 2 }, people);
    const onFirstTue = rows.filter((r) => r.visit1 === "2026-07-14").length;
    expect(onFirstTue).toBe(2); // capacity honoured
    expect(rows.every((r) => r.status === "ok")).toBe(true);
  });

  it("marks unschedulable when the window has no clinic day that works", () => {
    // One-day window on a Monday → no Tue/Thu clinic day at all.
    const rows = planCampaign(
      { startDate: "2026-07-13", endDate: "2026-07-13", capacityPerDay: 5 },
      [{ profileId: "d", name: "No Slot" }],
    );
    expect(rows[0].status).toBe("unscheduled");
  });
});
