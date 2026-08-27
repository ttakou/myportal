import { describe, expect, it } from "vitest";
import {
  applyStageDates,
  offsetFromDate,
  setStageDate,
  stageDates,
  validateStageDates,
} from "@/lib/performance/phase-dates";
import { HOUSE_PHASES } from "@/types/workflow";
import { stageDueDate } from "@/lib/workflow-engine";

const START = "2026-01-01";
const current = Object.fromEntries(
  stageDates(HOUSE_PHASES, START).map((s) => [s.key, s.date]),
);

describe("offsetFromDate", () => {
  it("counts days from the cycle start", () => {
    expect(offsetFromDate(START, "2026-01-01")).toBe(0);
    expect(offsetFromDate(START, "2026-03-31")).toBe(89);
    expect(offsetFromDate(START, "2026-12-31")).toBe(364);
  });

  it("is negative before the start", () => {
    expect(offsetFromDate(START, "2025-12-25")).toBe(-7);
  });

  it("is unaffected by a daylight-saving shift", () => {
    expect(offsetFromDate("2026-03-01", "2026-03-31")).toBe(30);
  });

  it("round-trips with the date the engine computes", () => {
    for (const s of HOUSE_PHASES) {
      const date = stageDueDate(s, START);
      expect(offsetFromDate(START, date)).toBe(s.dueOffsetDays);
    }
  });
});

describe("stageDates", () => {
  it("gives every step its date, in process order", () => {
    const dates = stageDates(HOUSE_PHASES, START);
    expect(dates).toHaveLength(HOUSE_PHASES.length);
    expect(dates[0]).toMatchObject({ key: "goals_setting_submit", date: "2026-03-10" });
    expect(dates[dates.length - 1]).toMatchObject({
      key: "final_appraisal_rating",
      date: "2026-12-31",
    });
  });
});

describe("validateStageDates", () => {
  it("accepts the dates the process already runs", () => {
    expect(validateStageDates(HOUSE_PHASES, current, START)).toBeNull();
  });

  it("accepts a whole set moved later", () => {
    const moved = Object.fromEntries(
      Object.entries(current).map(([k, d]) => [k, d.replace("2026", "2026")]),
    );
    expect(validateStageDates(HOUSE_PHASES, moved, START)).toBeNull();
  });

  it("rejects a step dated before the one it follows", () => {
    // The order is fixed by the process; a step due before its predecessor
    // would read as overdue from the day the cycle opens.
    const bad = { ...current, goals_setting_review: "2026-03-01" };
    const error = validateStageDates(HOUSE_PHASES, bad, START);
    expect(error).toContain("manager review and comment");
    expect(error).toContain("before");
  });

  it("allows two steps to share a date", () => {
    const same = { ...current, goals_setting_review: current.goals_setting_submit };
    expect(validateStageDates(HOUSE_PHASES, same, START)).toBeNull();
  });

  it("rejects a date before the cycle starts", () => {
    const bad = { ...current, goals_setting_submit: "2025-12-01" };
    expect(validateStageDates(HOUSE_PHASES, bad, START)).toContain("before the cycle starts");
  });

  it("rejects a missing date rather than silently keeping the old one", () => {
    const bad = { ...current, mid_year_submit: "" };
    expect(validateStageDates(HOUSE_PHASES, bad, START)).toContain("no date");
  });

  it("rejects a malformed date", () => {
    expect(validateStageDates(HOUSE_PHASES, { ...current, mid_year_submit: "31/03/2026" }, START))
      .toContain("invalid date");
  });
});

describe("applyStageDates", () => {
  it("writes each date back as a day offset", () => {
    const next = applyStageDates(
      HOUSE_PHASES,
      { ...current, goals_setting_submit: "2026-03-01" },
      START,
    );
    expect(next[0].dueOffsetDays).toBe(59);
    expect(stageDueDate(next[0], START)).toBe("2026-03-01");
  });

  it("leaves everything else about a stage untouched", () => {
    const next = applyStageDates(HOUSE_PHASES, current, START);
    next.forEach((s, i) => {
      expect(s).toEqual(HOUSE_PHASES[i]);
    });
  });

  it("keeps a stage the editor did not send", () => {
    const next = applyStageDates(HOUSE_PHASES, { goals_setting_submit: "2026-03-01" }, START);
    expect(next[1]).toEqual(HOUSE_PHASES[1]);
  });

  it("re-dates for another year once the offsets are stored", () => {
    // The point of storing offsets: dates set for 2026 carry to 2027.
    const next = applyStageDates(HOUSE_PHASES, { ...current, mid_year_signoff: "2026-07-15" }, START);
    const mid = next.find((s) => s.key === "mid_year_signoff")!;
    expect(stageDueDate(mid, "2027-01-01")).toBe("2027-07-15");
  });
});

describe("setStageDate", () => {
  const dateOf = (stages: typeof HOUSE_PHASES, key: string) =>
    stageDueDate(stages.find((s) => s.key === key)!, START);

  it("moves the step it is asked to move", () => {
    const { stages } = setStageDate(HOUSE_PHASES, "mid_year_signoff", "2026-07-15", START);
    expect(dateOf(stages, "mid_year_signoff")).toBe("2026-07-15");
  });

  it("leaves everything else alone when the order still holds", () => {
    // Mid-year sign-off is due 30 June; 15 July is after its own steps and
    // still well before final review, so nothing else needs to give.
    const { moved } = setStageDate(HOUSE_PHASES, "mid_year_signoff", "2026-07-15", START);
    expect(moved.map((m) => m.key)).toEqual(["mid_year_signoff"]);
  });

  it("pulls its own earlier steps back when a phase end moves in front of them", () => {
    // Mid-year runs submit(9 Jun) → review(16 Jun) → employee(23 Jun) → signoff(30 Jun).
    // Ending it on 10 June has to drag the two in the middle back with it.
    const { stages, moved } = setStageDate(HOUSE_PHASES, "mid_year_signoff", "2026-06-10", START);
    expect(dateOf(stages, "mid_year_signoff")).toBe("2026-06-10");
    expect(dateOf(stages, "mid_year_employee_signoff")).toBe("2026-06-10");
    expect(dateOf(stages, "mid_year_review")).toBe("2026-06-10");
    // Submit was already before 10 June, so it stays put.
    expect(dateOf(stages, "mid_year_submit")).toBe("2026-06-09");
    expect(moved.map((m) => m.key)).not.toContain("mid_year_submit");
  });

  it("pushes later steps forward when a phase end runs past them", () => {
    const { stages } = setStageDate(HOUSE_PHASES, "mid_year_signoff", "2026-12-20", START);
    expect(dateOf(stages, "final_review_submit")).toBe("2026-12-20");
    expect(dateOf(stages, "annual_calibration_signoff")).toBe("2026-12-20");
    // The last step was already later, so it holds its own date.
    expect(dateOf(stages, "final_appraisal_rating")).toBe("2026-12-31");
  });

  it("reports every date it changed, and what it changed from", () => {
    const { moved } = setStageDate(HOUSE_PHASES, "mid_year_signoff", "2026-06-10", START);
    expect(moved).toContainEqual({
      key: "mid_year_employee_signoff",
      label: expect.any(String),
      from: "2026-06-23",
      to: "2026-06-10",
    });
  });

  it("always leaves the sequence valid", () => {
    for (const target of ["2026-01-01", "2026-06-10", "2026-12-31"]) {
      const { stages } = setStageDate(HOUSE_PHASES, "mid_year_signoff", target, START);
      const dates = Object.fromEntries(stageDates(stages, START).map((s) => [s.key, s.date]));
      expect(validateStageDates(stages, dates, START)).toBeNull();
    }
  });

  it("is a no-op for a stage the workflow does not have", () => {
    const { stages, moved } = setStageDate(HOUSE_PHASES, "not_a_stage", "2026-06-01", START);
    expect(moved).toEqual([]);
    expect(stages).toBe(HOUSE_PHASES);
  });

  it("changes nothing when the date is the one already stored", () => {
    const { moved } = setStageDate(HOUSE_PHASES, "mid_year_signoff", "2026-06-30", START);
    expect(moved).toEqual([]);
  });
});
