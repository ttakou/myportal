import { describe, expect, it } from "vitest";
import { HOUSE_PHASES, HOUSE_PHASE_ORDER, STAGE_ROLE_LABEL } from "@/types/workflow";
import { stageDueDate, applicableStages, activeStageKeys } from "@/lib/workflow-engine";

const CYCLE_START = "2026-01-01";

describe("the house appraisal process", () => {
  it("runs the five phases in the agreed order", () => {
    expect(HOUSE_PHASE_ORDER).toEqual([
      "goals_setting",
      "mid_year_review",
      "final_review",
      "annual_calibration",
      "final_appraisal",
    ]);
  });

  it("uses the agreed names", () => {
    expect(HOUSE_PHASES.map((s) => s.label)).toEqual([
      "Goals Setting",
      "Mid Year Review",
      "Final Review",
      "Annual Calibration",
      "Final Appraisal",
    ]);
  });

  it("lands each phase on its real date for a calendar-year cycle", () => {
    const dates = HOUSE_PHASES.map((s) => stageDueDate(s, CYCLE_START));
    expect(dates).toEqual([
      "2026-03-31", // goal-setting deadline
      "2026-06-30", // end of the mid-year window
      "2026-12-05", // end of the final-review window
      "2026-12-15", // end of calibration
      "2026-12-31", // year end
    ]);
  });

  it("keeps the dates strictly increasing, so no phase is due before the one before it", () => {
    const dates = HOUSE_PHASES.map((s) => stageDueDate(s, CYCLE_START));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it("re-dates itself for a cycle starting in another year", () => {
    expect(stageDueDate(HOUSE_PHASES[0], "2027-01-01")).toBe("2027-03-31");
    expect(stageDueDate(HOUSE_PHASES[4], "2027-01-01")).toBe("2027-12-31");
  });

  it("gives every phase an owner who can actually be chased", () => {
    for (const s of HOUSE_PHASES) {
      expect(STAGE_ROLE_LABEL[s.responsibleRole]).toBeTruthy();
    }
    expect(HOUSE_PHASES.map((s) => s.responsibleRole)).toEqual([
      "employee",
      "line_manager",
      "line_manager",
      "calibration",
      "employee",
    ]);
  });

  it("lets the manager send a review back, but not the calibration committee", () => {
    const byKey = Object.fromEntries(HOUSE_PHASES.map((s) => [s.key, s]));
    expect(byKey.mid_year_review.allowReturn).toBe(true);
    expect(byKey.final_review.allowReturn).toBe(true);
    expect(byKey.annual_calibration.allowReturn).toBe(false);
  });

  it("opens the right fields at the right time", () => {
    const byKey = Object.fromEntries(HOUSE_PHASES.map((s) => [s.key, s]));
    expect(byKey.goals_setting.editableFields).toContain("goals");
    // The overall rating is not settable before the final review.
    expect(byKey.mid_year_review.editableFields).not.toContain("overall_rating");
    expect(byKey.final_review.editableFields).toContain("overall_rating");
    expect(byKey.annual_calibration.editableFields).toEqual(["overall_rating"]);
  });

  it("applies to everybody — no phase is conditional", () => {
    expect(applicableStages(HOUSE_PHASES, {})).toHaveLength(5);
  });

  it("walks one phase at a time from the start", () => {
    expect(activeStageKeys(HOUSE_PHASES, {}, [])).toEqual(["goals_setting"]);
    expect(activeStageKeys(HOUSE_PHASES, {}, ["goals_setting"])).toEqual(["mid_year_review"]);
    expect(
      activeStageKeys(HOUSE_PHASES, {}, ["goals_setting", "mid_year_review", "final_review"]),
    ).toEqual(["annual_calibration"]);
  });

  it("is finished only once the final appraisal is signed", () => {
    expect(activeStageKeys(HOUSE_PHASES, {}, HOUSE_PHASE_ORDER)).toEqual([]);
    expect(activeStageKeys(HOUSE_PHASES, {}, HOUSE_PHASE_ORDER.slice(0, 4))).toEqual([
      "final_appraisal",
    ]);
  });

  it("notifies on every phase, so no deadline passes quietly", () => {
    expect(HOUSE_PHASES.every((s) => s.notify)).toBe(true);
  });
});
