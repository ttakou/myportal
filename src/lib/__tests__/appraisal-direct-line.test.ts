import { describe, expect, it } from "vitest";
import {
  managerActionNeeded,
  type AppraisalStage,
  type AppraisalStatus,
} from "@/types/appraisal";

/**
 * `managerActionNeeded` decides which of a manager's direct reports light up as
 * "Action needed" on the performance dashboard — i.e. the appraisal is in the
 * line-manager's court and they must act next.
 */
describe("managerActionNeeded", () => {
  const cases: [AppraisalStage, AppraisalStatus, boolean][] = [
    // Goal setting / mid-year handed up for the manager's review.
    ["goal_setting", "pending_manager_review", true],
    ["goal_review", "pending_manager_review", true],
    // The manager is writing the evaluation.
    ["manager_review", "draft", true],
    ["manager_review", "pending_manager_review", true],
    // Final discussion ready for the manager to record.
    ["final_discussion", "ready_for_final_discussion", true],
    // Sitting with the employee — not the manager's turn.
    ["self_assessment", "pending_employee_submission", false],
    ["goal_setting", "draft", false],
    ["acknowledgement", "pending_employee_acknowledgement", false],
    // Past the manager — with HR / second level.
    ["hr_review", "pending_hr_review", false],
    ["hr_review", "pending_second_level", false],
    // Settled.
    ["closed", "completed", false],
    ["closed", "closed", false],
  ];

  it.each(cases)("stage=%s status=%s → %s", (stage, status, expected) => {
    expect(managerActionNeeded(stage, status)).toBe(expected);
  });
});
