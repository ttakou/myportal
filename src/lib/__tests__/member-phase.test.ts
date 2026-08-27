import { describe, expect, it } from "vitest";
import { memberPhase, phaseNames } from "@/lib/performance/member-phase";
import { HOUSE_PHASES } from "@/types/workflow";

const ctx = { department: null, isManager: false, isManagementGrade: false };
const phaseOf = (completed: string[]) => memberPhase(HOUSE_PHASES, ctx, completed);

const GOALS = [
  "goals_setting_submit",
  "goals_setting_review",
  "goals_setting_employee_signoff",
  "goals_setting_signoff",
];
const MID_YEAR = [
  "mid_year_submit",
  "mid_year_review",
  "mid_year_employee_signoff",
  "mid_year_signoff",
];
const FINAL_REVIEW = [
  "final_review_submit",
  "final_review_review",
  "final_review_employee_signoff",
  "final_review_signoff",
];

describe("phaseNames", () => {
  it("lists the five phases in process order", () => {
    expect(phaseNames(HOUSE_PHASES, ctx)).toEqual([
      "Goals Setting",
      "Mid Year Review",
      "Final Review",
      "Annual Calibration",
      "Final Appraisal",
    ]);
  });
});

describe("memberPhase", () => {
  it("starts everybody in the first phase", () => {
    expect(phaseOf([])).toMatchObject({
      phase: "Goals Setting",
      phaseNumber: 1,
      phaseCount: 5,
      finished: false,
    });
  });

  it("names the step they are on and whose move it is", () => {
    expect(phaseOf([])).toMatchObject({
      stageLabel: "Goals Setting — employee submits",
      owner: "employee",
    });
  });

  it("stays in a phase until every step of it is done", () => {
    expect(phaseOf(GOALS.slice(0, 1)).phase).toBe("Goals Setting");
    expect(phaseOf(GOALS.slice(0, 3)).phase).toBe("Goals Setting");
    expect(phaseOf(GOALS.slice(0, 3)).owner).toBe("line_manager");
  });

  it("moves to the next phase once the previous one closes", () => {
    expect(phaseOf(GOALS)).toMatchObject({ phase: "Mid Year Review", phaseNumber: 2 });
    expect(phaseOf([...GOALS, ...MID_YEAR])).toMatchObject({
      phase: "Final Review",
      phaseNumber: 3,
    });
  });

  it("reaches the rating that ends the process", () => {
    const throughCalibration = [
      ...GOALS,
      ...MID_YEAR,
      ...FINAL_REVIEW,
      "annual_calibration_signoff",
    ];
    expect(phaseOf(throughCalibration)).toMatchObject({
      phase: "Final Appraisal",
      phaseNumber: 5,
      owner: "pgm",
    });
  });

  it("is finished, and in no phase, once the rating is recorded", () => {
    const everything = [
      ...GOALS,
      ...MID_YEAR,
      ...FINAL_REVIEW,
      "annual_calibration_signoff",
      "final_appraisal_rating",
    ];
    expect(phaseOf(everything)).toMatchObject({
      finished: true,
      phase: null,
      phaseNumber: null,
      phaseCount: 5,
    });
  });

  it("reports a person behind the cycle, which is the point of asking", () => {
    // The cycle can be open on mid-year while this person has not finished
    // goal setting — that is exactly what a manager needs to see.
    expect(phaseOf(["goals_setting_submit"]).phase).toBe("Goals Setting");
  });

  it("has nothing to say about a cycle with no workflow", () => {
    expect(memberPhase([], ctx, [])).toMatchObject({
      phase: null,
      phaseCount: 0,
      finished: false,
    });
  });

  it("ignores a completed step the workflow no longer has", () => {
    expect(phaseOf([...GOALS, "a_stage_that_was_removed"]).phase).toBe("Mid Year Review");
  });
});
