import { describe, expect, it } from "vitest";
import { reviewControls } from "@/lib/performance/review-controls";

const at = (stage: string, status: string, over: Partial<{ goalsReadOnly: boolean; goalCount: number }> = {}) =>
  reviewControls({ stage, status, goalCount: 3, ...over });

describe("reviewControls", () => {
  it("offers the goal decisions only while the goals sit with the manager", () => {
    const waiting = at("goal_setting", "pending_manager_review");
    expect(waiting.showGoalReview).toBe(true);
    expect(waiting.canDecideGoals).toBe(true);
    expect(waiting.actionNeeded).toBe(true);

    // Still the goal-setting stage, but the employee has not submitted: the
    // comment box shows, the decisions do not.
    const drafting = at("goal_setting", "not_started");
    expect(drafting.showGoalReview).toBe(true);
    expect(drafting.canDecideGoals).toBe(false);
    expect(drafting.actionNeeded).toBe(false);
  });

  it("hides the goal review when there are no goals to review", () => {
    expect(at("goal_setting", "pending_manager_review", { goalCount: 0 }).showGoalReview).toBe(false);
  });

  it("keeps the mid-year box after the review is complete, but not the button", () => {
    const pending = at("goal_review", "pending_manager_review");
    expect(pending.showMidYear).toBe(true);
    expect(pending.canCompleteMidYear).toBe(true);

    const done = at("goal_review", "in_progress");
    expect(done.showMidYear).toBe(true);
    expect(done.canCompleteMidYear).toBe(false);
  });

  it("rates only during the manager's evaluation, and never read-only goals", () => {
    expect(at("manager_review", "in_progress").evaluating).toBe(true);
    // Goals set in another cycle are rated there, not here.
    expect(at("manager_review", "in_progress", { goalsReadOnly: true }).evaluating).toBe(false);
    expect(at("goal_review", "in_progress").evaluating).toBe(false);
  });

  it("records the discussion only when the appraisal is ready for it", () => {
    expect(at("final_discussion", "ready_for_final_discussion").readyForDiscussion).toBe(true);
    expect(at("final_discussion", "completed").readyForDiscussion).toBe(false);
  });

  it("always leaves somewhere to write the manager's comment", () => {
    // The stage-specific boxes cover three stages. On any other, a stand-in
    // holding the phase open for a remark still needs a box.
    expect(at("self_assessment", "not_started").needsPlainComment).toBe(true);
    expect(at("acknowledgement", "completed").needsPlainComment).toBe(true);

    expect(at("goal_setting", "not_started").needsPlainComment).toBe(false);
    expect(at("goal_review", "in_progress").needsPlainComment).toBe(false);
    expect(at("manager_review", "in_progress").needsPlainComment).toBe(false);
  });

  it("falls back to the plain box when goal setting has no goals", () => {
    // No goals, so no goal-review box — and therefore the plain one.
    expect(at("goal_setting", "not_started", { goalCount: 0 }).needsPlainComment).toBe(true);
  });
});
