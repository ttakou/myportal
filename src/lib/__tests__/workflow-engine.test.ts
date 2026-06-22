import { describe, expect, it } from "vitest";
import {
  COMPLETED,
  REJECTED,
  applicableStages,
  canAct,
  editableFields,
  evalCondition,
  firstStageKey,
  nextStageKey,
  prevStageKey,
  progressPercent,
  skipAutoStages,
  transition,
  type EmployeeContext,
} from "@/lib/workflow-engine";
import type { WorkflowStage } from "@/types/workflow";

function stage(key: string, role: WorkflowStage["responsibleRole"], extra: Partial<WorkflowStage> = {}): WorkflowStage {
  return {
    key,
    label: key,
    responsibleRole: role,
    dueOffsetDays: 0,
    mandatory: true,
    editableFields: [],
    allowApprove: true,
    allowReject: false,
    allowReturn: false,
    autoProgress: false,
    parallelGroup: null,
    condition: null,
    notify: true,
    ...extra,
  };
}

const flow: WorkflowStage[] = [
  stage("goals", "employee", { editableFields: ["goals"] }),
  stage("review", "line_manager", { allowReturn: true, editableFields: ["manager_comment"] }),
  stage("second", "second_level", { condition: "grade:management", allowReject: true }),
  stage("ack", "employee"),
];

const ic: EmployeeContext = { isManagementGrade: false };
const mgr: EmployeeContext = { isManagementGrade: true };

describe("evalCondition", () => {
  it("treats empty/unknown conditions as passing", () => {
    expect(evalCondition(null, ic)).toBe(true);
    expect(evalCondition("", ic)).toBe(true);
    expect(evalCondition("whatever:x", ic)).toBe(true);
  });
  it("matches grade:management against isManagementGrade", () => {
    expect(evalCondition("grade:management", mgr)).toBe(true);
    expect(evalCondition("grade:management", ic)).toBe(false);
  });
  it("supports negation and department match", () => {
    expect(evalCondition("!grade:management", ic)).toBe(true);
    expect(evalCondition("department:eng", { department: "Eng" })).toBe(true);
    expect(evalCondition("department:eng", { department: "Sales" })).toBe(false);
  });
});

describe("applicableStages", () => {
  it("drops conditional stages that don't apply", () => {
    expect(applicableStages(flow, ic).map((s) => s.key)).toEqual(["goals", "review", "ack"]);
    expect(applicableStages(flow, mgr).map((s) => s.key)).toEqual(["goals", "review", "second", "ack"]);
  });
});

describe("navigation", () => {
  it("finds first and next stages over the applicable list", () => {
    expect(firstStageKey(flow, ic)).toBe("goals");
    expect(nextStageKey(flow, ic, "review")).toBe("ack"); // skips management-only stage
    expect(nextStageKey(flow, mgr, "review")).toBe("second");
    expect(nextStageKey(flow, ic, "ack")).toBe(COMPLETED);
  });
  it("returns previous stage for correction", () => {
    expect(prevStageKey(flow, ic, "review")).toBe("goals");
    expect(prevStageKey(flow, ic, "goals")).toBeNull();
  });
});

describe("permissions", () => {
  it("only the responsible role can act / edit", () => {
    const review = flow[1];
    expect(canAct(review, "line_manager")).toBe(true);
    expect(canAct(review, "employee")).toBe(false);
    expect(editableFields(review, "line_manager")).toEqual(["manager_comment"]);
    expect(editableFields(review, "employee")).toEqual([]);
  });
});

describe("transition", () => {
  it("advances on approve and completes at the end", () => {
    expect(transition(flow, ic, "goals", "approve").nextKey).toBe("review");
    expect(transition(flow, ic, "ack", "approve")).toMatchObject({ nextKey: COMPLETED, done: true });
  });
  it("returns to previous stage only when allowed", () => {
    expect(transition(flow, ic, "review", "return").nextKey).toBe("goals");
    expect(transition(flow, ic, "goals", "return").nextKey).toBe("goals"); // not allowed → no-op
  });
  it("rejects only when the stage permits it", () => {
    expect(transition(flow, mgr, "second", "reject")).toMatchObject({ nextKey: REJECTED, rejected: true });
    expect(transition(flow, ic, "review", "reject").nextKey).toBe("review"); // reject not allowed
  });
});

describe("skipAutoStages", () => {
  const auto: WorkflowStage[] = [
    stage("a", "employee"),
    stage("auto1", "hr", { autoProgress: true }),
    stage("auto2", "hr", { autoProgress: true }),
    stage("b", "line_manager"),
  ];
  it("skips consecutive auto-progress stages to the next human stage", () => {
    expect(skipAutoStages(auto, ic, "auto1")).toBe("b");
    expect(skipAutoStages(auto, ic, "a")).toBe("a"); // non-auto stays put
  });
  it("returns COMPLETED when auto stages run off the end", () => {
    const trailing: WorkflowStage[] = [stage("x", "employee"), stage("y", "hr", { autoProgress: true })];
    expect(skipAutoStages(trailing, ic, "y")).toBe(COMPLETED);
  });
});

describe("progressPercent", () => {
  it("reports 0 at start and 100 when completed", () => {
    expect(progressPercent(flow, ic, "goals")).toBe(0);
    expect(progressPercent(flow, ic, COMPLETED)).toBe(100);
    expect(progressPercent(flow, ic, "ack")).toBe(67); // 2 of 3 applicable done
  });
});
