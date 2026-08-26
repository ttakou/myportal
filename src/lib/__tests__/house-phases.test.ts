import { describe, expect, it } from "vitest";
import {
  HOUSE_PHASES,
  HOUSE_PHASE_GROUPS,
  HOUSE_PHASE_ORDER,
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
    expect(byKey.annual_calibration.responsibleRole).toBe("calibration");
  });

  it("covers every stage with exactly one phase, and none twice", () => {
    const grouped = HOUSE_PHASE_GROUPS.flatMap((g) => g.stageKeys);
    expect(grouped).toEqual(HOUSE_PHASES.map((s) => s.key));
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("closes each phase on the date its old cycle carried", () => {
    expect(due("goals_setting_manager")).toBe("2026-03-31");
    expect(due("mid_year_manager")).toBe("2026-06-30");
    expect(due("final_review_manager")).toBe("2026-12-05");
    expect(due("annual_calibration")).toBe("2026-12-15");
    expect(due("final_appraisal")).toBe("2026-12-31");
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
    expect(stageDueDate(byKey.final_appraisal, "2027-01-01")).toBe("2027-12-31");
  });

  it("gives every stage an owner who can be chased", () => {
    for (const s of HOUSE_PHASES) expect(STAGE_ROLE_LABEL[s.responsibleRole]).toBeTruthy();
  });

  it("lets a manager send a phase back, but not the committee", () => {
    expect(byKey.goals_setting_manager.allowReturn).toBe(true);
    expect(byKey.mid_year_manager.allowReturn).toBe(true);
    expect(byKey.final_review_manager.allowReturn).toBe(true);
    expect(byKey.annual_calibration.allowReturn).toBe(false);
  });

  it("does not let the overall rating be set before the final review", () => {
    expect(byKey.mid_year_manager.editableFields).not.toContain("overall_rating");
    expect(byKey.final_review_manager.editableFields).toContain("overall_rating");
    expect(byKey.annual_calibration.editableFields).toEqual(["overall_rating"]);
  });

  it("applies to everybody — no stage is conditional", () => {
    expect(applicableStages(HOUSE_PHASES, {})).toHaveLength(HOUSE_PHASES.length);
  });

  it("walks one step at a time, employee then manager", () => {
    expect(activeStageKeys(HOUSE_PHASES, {}, [])).toEqual(["goals_setting_employee"]);
    expect(activeStageKeys(HOUSE_PHASES, {}, ["goals_setting_employee"])).toEqual([
      "goals_setting_manager",
    ]);
    expect(
      activeStageKeys(HOUSE_PHASES, {}, ["goals_setting_employee", "goals_setting_manager"]),
    ).toEqual(["mid_year_employee"]);
  });

  it("is finished only once the final appraisal is signed", () => {
    const all = HOUSE_PHASES.map((s) => s.key);
    expect(activeStageKeys(HOUSE_PHASES, {}, all)).toEqual([]);
    expect(activeStageKeys(HOUSE_PHASES, {}, all.slice(0, -1))).toEqual(["final_appraisal"]);
  });

  it("notifies on every stage, so no deadline passes quietly", () => {
    expect(HOUSE_PHASES.every((s) => s.notify)).toBe(true);
  });
});
