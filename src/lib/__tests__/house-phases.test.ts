import { describe, expect, it } from "vitest";
import {
  HOUSE_PHASES,
  HOUSE_PHASE_GROUPS,
  HOUSE_PHASE_ORDER,
  PHASE_SIGNOFF_KEYS,
  STAGE_ROLE_LABEL,
} from "@/types/workflow";
import { activeStageKeys, applicableStages, stageDueDate } from "@/lib/workflow-engine";

const CYCLE_START = "2026-01-01";
const byKey = Object.fromEntries(HOUSE_PHASES.map((s) => [s.key, s]));
const due = (key: string) => stageDueDate(byKey[key], CYCLE_START);
/** The three phases the employee takes part in, which share one shape. */
const PARTICIPATORY = HOUSE_PHASE_GROUPS.slice(0, 3);

describe("the house appraisal process", () => {
  it("runs the five phases in the agreed order", () => {
    expect(HOUSE_PHASE_ORDER).toEqual([
      "Goals Setting",
      "Mid Year Review",
      "Final Review",
      "Annual Calibration",
      "Final Appraisal",
    ]);
  });

  it("covers every stage with exactly one phase, and none twice", () => {
    const grouped = HOUSE_PHASE_GROUPS.flatMap((g) => g.stageKeys);
    expect(grouped).toEqual(HOUSE_PHASES.map((s) => s.key));
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});

describe("a phase the employee takes part in", () => {
  it("runs submit, review, employee sign-off, manager sign-off", () => {
    for (const phase of PARTICIPATORY) {
      expect(phase.stageKeys).toHaveLength(4);
      expect(phase.stageKeys.map((k) => byKey[k].responsibleRole)).toEqual([
        "employee",
        "line_manager",
        "employee",
        "line_manager",
      ]);
    }
  });

  it("lets the employee write at their submit step", () => {
    expect(byKey.goals_setting_submit.editableFields).toContain("goals");
    expect(byKey.mid_year_submit.editableFields).toContain("self_rating");
    expect(byKey.final_review_submit.editableFields).toContain("self_rating");
  });

  it("opens the line-manager comment at the review step of every phase", () => {
    for (const phase of PARTICIPATORY) {
      expect(byKey[phase.stageKeys[1]].editableFields).toContain("manager_comment");
    }
  });

  it("has the employee sign off after the manager has commented, not before", () => {
    // The point of the employee's signature: it says they have seen the
    // manager's comment. Signing first would leave a comment on the record the
    // employee never saw.
    for (const phase of PARTICIPATORY) {
      const [, review, employeeSignoff] = phase.stageKeys;
      expect(byKey[employeeSignoff].allowApprove).toBe(true);
      expect(stageDueDate(byKey[review], CYCLE_START) < stageDueDate(byKey[employeeSignoff], CYCLE_START)).toBe(true);
    }
  });

  it("closes on the manager's sign-off, which can also send the phase back", () => {
    for (const phase of PARTICIPATORY) {
      const closing = byKey[phase.stageKeys[3]];
      expect(closing.allowApprove).toBe(true);
      expect(closing.allowReturn).toBe(true);
    }
  });
});

describe("phase deadlines", () => {
  it("closes each phase on the date its old cycle carried", () => {
    expect(due("goals_setting_signoff")).toBe("2026-03-31");
    expect(due("mid_year_signoff")).toBe("2026-06-30");
    expect(due("final_review_signoff")).toBe("2026-12-05");
    expect(due("annual_calibration_signoff")).toBe("2026-12-15");
    expect(due("final_appraisal_signoff")).toBe("2026-12-31");
  });

  it("spaces the four steps of a phase a week apart", () => {
    expect(["goals_setting_submit", "goals_setting_review", "goals_setting_employee_signoff", "goals_setting_signoff"].map(due)).toEqual([
      "2026-03-10",
      "2026-03-17",
      "2026-03-24",
      "2026-03-31",
    ]);
  });

  it("keeps every date strictly increasing across the whole process", () => {
    const dates = HOUSE_PHASES.map((s) => stageDueDate(s, CYCLE_START));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it("re-dates itself for a cycle starting in another year", () => {
    expect(stageDueDate(byKey.goals_setting_submit, "2027-01-01")).toBe("2027-03-10");
    expect(stageDueDate(byKey.final_appraisal_signoff, "2027-01-01")).toBe("2027-12-31");
  });
});

describe("calibration and the final appraisal", () => {
  it("leaves calibration to the committee alone", () => {
    expect(HOUSE_PHASE_GROUPS[3].stageKeys).toEqual(["annual_calibration_signoff"]);
    expect(byKey.annual_calibration_signoff.responsibleRole).toBe("calibration");
  });

  it("records the final rating after calibration, then has it signed", () => {
    // Calibration can move a rating, so the number that stands is recorded
    // afterwards — signing the earlier one would put the wrong rating on record.
    expect(HOUSE_PHASE_GROUPS[4].stageKeys).toEqual([
      "final_appraisal_rating",
      "final_appraisal_employee_signoff",
      "final_appraisal_signoff",
    ]);
    expect(byKey.final_appraisal_rating.editableFields).toContain("overall_rating");
    // Recorded by the PGM — or by an HR admin, who counts as holding the role.
    expect(byKey.final_appraisal_rating.responsibleRole).toBe("pgm");
    expect(due("annual_calibration_signoff") < due("final_appraisal_rating")).toBe(true);
  });
});

describe("the process as a whole", () => {
  it("ends every phase in a sign-off that closes it for that one person", () => {
    expect(PHASE_SIGNOFF_KEYS).toHaveLength(5);
    for (const key of PHASE_SIGNOFF_KEYS) expect(byKey[key].allowApprove).toBe(true);
  });

  it("gives every stage an owner who can be chased", () => {
    for (const s of HOUSE_PHASES) expect(STAGE_ROLE_LABEL[s.responsibleRole]).toBeTruthy();
  });

  it("does not let the overall rating be set before the final review", () => {
    expect(byKey.goals_setting_review.editableFields).not.toContain("overall_rating");
    expect(byKey.mid_year_review.editableFields).not.toContain("overall_rating");
    expect(byKey.final_review_review.editableFields).toContain("overall_rating");
  });

  it("applies to everybody — no stage is conditional", () => {
    expect(applicableStages(HOUSE_PHASES, {})).toHaveLength(HOUSE_PHASES.length);
  });

  it("walks the four steps of a phase in order before starting the next", () => {
    const keys = HOUSE_PHASE_GROUPS[0].stageKeys;
    expect(activeStageKeys(HOUSE_PHASES, {}, [])).toEqual([keys[0]]);
    expect(activeStageKeys(HOUSE_PHASES, {}, keys.slice(0, 1))).toEqual([keys[1]]);
    expect(activeStageKeys(HOUSE_PHASES, {}, keys.slice(0, 2))).toEqual([keys[2]]);
    expect(activeStageKeys(HOUSE_PHASES, {}, keys.slice(0, 3))).toEqual([keys[3]]);
    expect(activeStageKeys(HOUSE_PHASES, {}, keys)).toEqual(["mid_year_submit"]);
  });

  it("is finished only once the last sign-off is given", () => {
    const all = HOUSE_PHASES.map((s) => s.key);
    expect(activeStageKeys(HOUSE_PHASES, {}, all)).toEqual([]);
    expect(activeStageKeys(HOUSE_PHASES, {}, all.slice(0, -1))).toEqual([
      "final_appraisal_signoff",
    ]);
  });

  it("notifies on every stage, so no deadline passes quietly", () => {
    expect(HOUSE_PHASES.every((s) => s.notify)).toBe(true);
  });
});
