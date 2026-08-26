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

  it("gives the employee a step in each of the first three phases", () => {
    // The whole reason a phase is two stages: a stage only opens its fields to
    // the role that owns it, so a manager-owned phase shuts the employee out.
    for (const phase of HOUSE_PHASE_GROUPS.slice(0, 3)) {
      const roles = phase.stageKeys.map((k) => byKey[k].responsibleRole);
      expect(roles).toEqual(["employee", "line_manager"]);
    }
  });

  it("lets the employee actually write something at each of those steps", () => {
    expect(byKey.goals_setting_employee.editableFields).toContain("goals");
    expect(byKey.mid_year_employee.editableFields).toContain("self_rating");
    expect(byKey.final_review_employee.editableFields).toContain("self_rating");
  });

  it("leaves calibration to the committee alone", () => {
    expect(byKey.annual_calibration_signoff.responsibleRole).toBe("calibration");
  });

  it("covers every stage with exactly one phase, and none twice", () => {
    const grouped = HOUSE_PHASE_GROUPS.flatMap((g) => g.stageKeys);
    expect(grouped).toEqual(HOUSE_PHASES.map((s) => s.key));
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("closes each phase on the date its old cycle carried", () => {
    expect(due("goals_setting_signoff")).toBe("2026-03-31");
    expect(due("mid_year_signoff")).toBe("2026-06-30");
    expect(due("final_review_signoff")).toBe("2026-12-05");
    expect(due("annual_calibration_signoff")).toBe("2026-12-15");
    expect(due("final_appraisal_signoff")).toBe("2026-12-31");
  });

  it("ends every phase in a sign-off that closes it for that one person", () => {
    // No phase rolls on silently: each has an explicit closing action, and the
    // engine records who took it.
    expect(PHASE_SIGNOFF_KEYS).toHaveLength(5);
    for (const key of PHASE_SIGNOFF_KEYS) {
      expect(byKey[key].allowApprove).toBe(true);
    }
  });

  it("records the final rating after calibration, then has it signed off", () => {
    // Calibration can move a rating, so the rating that stands is recorded
    // afterwards — and the person it belongs to acknowledges it.
    const phase = HOUSE_PHASE_GROUPS[4];
    expect(phase.stageKeys).toEqual(["final_appraisal_rating", "final_appraisal_signoff"]);
    expect(byKey.final_appraisal_rating.editableFields).toContain("overall_rating");
    expect(byKey.final_appraisal_signoff.responsibleRole).toBe("employee");
    expect(due("annual_calibration_signoff") < due("final_appraisal_rating")).toBe(true);
  });

  it("puts the employee's step a fortnight before the manager's", () => {
    expect(due("goals_setting_employee")).toBe("2026-03-17");
    expect(due("mid_year_employee")).toBe("2026-06-16");
    expect(due("final_review_employee")).toBe("2026-11-21");
  });

  it("keeps every date strictly increasing, so no step is due before the one before it", () => {
    const dates = HOUSE_PHASES.map((s) => stageDueDate(s, CYCLE_START));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it("re-dates itself for a cycle starting in another year", () => {
    expect(stageDueDate(byKey.goals_setting_employee, "2027-01-01")).toBe("2027-03-17");
    expect(stageDueDate(byKey.final_appraisal_signoff, "2027-01-01")).toBe("2027-12-31");
  });

  it("gives every stage an owner who can be chased", () => {
    for (const s of HOUSE_PHASES) expect(STAGE_ROLE_LABEL[s.responsibleRole]).toBeTruthy();
  });

  it("lets a manager send a phase back, but not the committee", () => {
    expect(byKey.goals_setting_signoff.allowReturn).toBe(true);
    expect(byKey.mid_year_signoff.allowReturn).toBe(true);
    expect(byKey.final_review_signoff.allowReturn).toBe(true);
    expect(byKey.annual_calibration_signoff.allowReturn).toBe(false);
  });

  it("does not let the overall rating be set before the final review", () => {
    expect(byKey.mid_year_signoff.editableFields).not.toContain("overall_rating");
    expect(byKey.final_review_signoff.editableFields).toContain("overall_rating");
    expect(byKey.goals_setting_employee.editableFields).not.toContain("overall_rating");
  });

  it("applies to everybody — no stage is conditional", () => {
    expect(applicableStages(HOUSE_PHASES, {})).toHaveLength(HOUSE_PHASES.length);
  });

  it("walks one step at a time, employee then manager", () => {
    expect(activeStageKeys(HOUSE_PHASES, {}, [])).toEqual(["goals_setting_employee"]);
    expect(activeStageKeys(HOUSE_PHASES, {}, ["goals_setting_employee"])).toEqual([
      "goals_setting_signoff",
    ]);
    expect(
      activeStageKeys(HOUSE_PHASES, {}, ["goals_setting_employee", "goals_setting_signoff"]),
    ).toEqual(["mid_year_employee"]);
  });

  it("is finished only once the final appraisal is signed", () => {
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
