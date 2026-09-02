/**
 * Which of the line manager's controls a report's appraisal is showing.
 *
 * The manager's card and the stand-in's page used to decide this separately,
 * and the stand-in's page decided almost nothing: it showed a read-only table
 * and one comment box, so whoever was covering for an absent manager could see
 * neither what the employee had achieved nor the buttons the manager would have
 * had. Deciding it in one place means the two screens show the same controls
 * at the same moment, and the rule can be tested without rendering anything.
 */

export interface ReviewStageInput {
  stage: string;
  status: string;
  goalsReadOnly?: boolean;
  goalCount: number;
}

export interface ReviewControls {
  /** The goals sit with the manager: OK for me / Modify are live. */
  canDecideGoals: boolean;
  /** Show the goal-review comment box at all (goal-setting stage). */
  showGoalReview: boolean;
  /** The mid-year review is the manager's to complete. */
  canCompleteMidYear: boolean;
  /** Show the mid-year comment box at all (mid-year stage). */
  showMidYear: boolean;
  /** Per-goal and competency ratings plus the overall evaluation. */
  evaluating: boolean;
  /** Record the final discussion meeting. */
  readyForDiscussion: boolean;
  /** Something above is waiting on the manager right now. */
  actionNeeded: boolean;
  /**
   * No stage-specific box is showing, so a plain comment box is still needed:
   * a stand-in holding a phase open for the manager's remark must have somewhere
   * to put it whatever stage the legacy column happens to be on.
   */
  needsPlainComment: boolean;
}

export function reviewControls(a: ReviewStageInput): ReviewControls {
  const awaitingGoalReview = a.stage === "goal_setting" && a.status === "pending_manager_review";
  const awaitingMidYear = a.stage === "goal_review" && a.status === "pending_manager_review";
  const evaluating = a.stage === "manager_review" && !a.goalsReadOnly;
  const readyForDiscussion =
    a.stage === "final_discussion" && a.status === "ready_for_final_discussion";

  const showGoalReview = a.goalCount > 0 && a.stage === "goal_setting";
  const showMidYear = a.stage === "goal_review";

  return {
    canDecideGoals: awaitingGoalReview,
    showGoalReview,
    canCompleteMidYear: awaitingMidYear,
    showMidYear,
    evaluating,
    readyForDiscussion,
    actionNeeded: awaitingGoalReview || awaitingMidYear || evaluating || readyForDiscussion,
    needsPlainComment: !showGoalReview && !showMidYear && !evaluating,
  };
}
