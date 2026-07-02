import { describe, it, expect } from "vitest";
import {
  planTraining,
  sessionSlots,
  isOnshoreOn,
  availableForRange,
  type TrainingPlanParams,
} from "@/lib/training-planner";

const base: TrainingPlanParams = {
  startDate: "2026-09-01", // Tue
  sessionDays: 3,
  capacity: 2,
  gapDays: 0,
};

describe("training session slots", () => {
  it("builds consecutive slots of the right span", () => {
    const slots = sessionSlots(base, 3);
    expect(slots[0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-03" });
    expect(slots[1]).toMatchObject({ startDate: "2026-09-04", endDate: "2026-09-06" });
    expect(slots[2].startDate).toBe("2026-09-07");
  });

  it("honours the gap between sessions", () => {
    const slots = sessionSlots({ ...base, gapDays: 2 }, 2);
    expect(slots[0].endDate).toBe("2026-09-03");
    expect(slots[1].startDate).toBe("2026-09-06"); // +1 +2 gap
  });
});

describe("availability", () => {
  it("needs the whole window onshore", () => {
    const crew = { cycleStart: "2026-09-01", offshoreDays: 21, onshoreDays: 21 };
    // 09-01 is day 0 → offshore
    expect(availableForRange({ profileId: "x", name: "X", crew }, "2026-09-01", "2026-09-03").ok).toBe(false);
    // day 22+ → onshore
    expect(availableForRange({ profileId: "x", name: "X", crew }, "2026-09-23", "2026-09-25").ok).toBe(true);
  });

  it("blocks a window overlapping a busy day", () => {
    const c = { profileId: "y", name: "Y", busyDates: ["2026-09-02"] };
    expect(availableForRange(c, "2026-09-01", "2026-09-03").ok).toBe(false);
    expect(availableForRange(c, "2026-09-04", "2026-09-06").ok).toBe(true);
  });

  it("no crew = always onshore", () => {
    expect(isOnshoreOn(null, "2026-09-01")).toBe(true);
  });
});

describe("planTraining", () => {
  it("packs the pool into capacity-sized sessions", () => {
    const pool = Array.from({ length: 5 }, (_, i) => ({ profileId: `p${i}`, name: `P${i}` }));
    const plan = planTraining(base, pool);
    expect(plan.unscheduled).toHaveLength(0);
    // 5 people, capacity 2 → 3 sessions (2,2,1)
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions[0].members).toHaveLength(2);
    expect(plan.sessions[2].members).toHaveLength(1);
  });

  it("books offshore staff only in an onshore session", () => {
    const crew = { cycleStart: "2026-09-01", offshoreDays: 21, onshoreDays: 21 };
    const plan = planTraining(base, [{ profileId: "r", name: "Rig", crew }]);
    const s = plan.sessions[0];
    expect(isOnshoreOn(crew, s.startDate)).toBe(true);
    expect(isOnshoreOn(crew, s.endDate)).toBe(true);
  });

  it("skips sessions that clash with training/medical", () => {
    const c = { profileId: "b", name: "Busy", busyDates: ["2026-09-01", "2026-09-02", "2026-09-03"] };
    const plan = planTraining(base, [c]);
    expect(plan.sessions[0].members[0].profileId).toBe("b");
    expect(plan.sessions[0].startDate >= "2026-09-04").toBe(true); // pushed past the clash
  });
});
