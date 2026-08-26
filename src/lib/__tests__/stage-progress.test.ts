import { describe, expect, it } from "vitest";
import {
  LEGACY_STAGE_LADDER,
  legacyCompletedStages,
  legacyStages,
  participantProgress,
  progressSheetRows,
  rankForReview,
  summarise,
  type ProgressInput,
} from "@/lib/performance/stage-progress";
import type { WorkflowStage } from "@/types/workflow";

const stage = (over: Partial<WorkflowStage> & { key: string }): WorkflowStage => ({
  label: over.key,
  responsibleRole: "employee",
  dueOffsetDays: 0,
  mandatory: true,
  editableFields: [],
  allowApprove: false,
  allowReject: false,
  allowReturn: false,
  autoProgress: false,
  parallelGroup: null,
  condition: null,
  notify: true,
  ...over,
});

const STAGES: WorkflowStage[] = [
  stage({ key: "goals", label: "Employee defines goals", dueOffsetDays: 0 }),
  stage({ key: "review", label: "Manager reviews goals", responsibleRole: "line_manager", dueOffsetDays: 14 }),
  stage({ key: "final", label: "Manager final assessment", responsibleRole: "line_manager", dueOffsetDays: 320 }),
];

const base = (over: Partial<ProgressInput> = {}): ProgressInput => ({
  appraisalId: "a1",
  employeeName: "Zoe Ayuk",
  department: "HSE",
  managerName: "Alan Bate",
  cycleName: "Annual 2026",
  cycleStart: "2026-01-01",
  stages: STAGES,
  completedStages: [],
  ...over,
});

describe("participantProgress", () => {
  it("puts a fresh appraisal on the first stage", () => {
    const p = participantProgress(base(), "2026-01-05");
    expect(p.currentStageLabel).toBe("Employee defines goals");
    expect(p.completedCount).toBe(0);
    expect(p.percentComplete).toBe(0);
    expect(p.finished).toBe(false);
  });

  it("advances as stages complete", () => {
    const p = participantProgress(base({ completedStages: ["goals"] }), "2026-01-05");
    expect(p.currentStageLabel).toBe("Manager reviews goals");
    expect(p.completedCount).toBe(1);
    expect(p.percentComplete).toBe(33);
  });

  it("names who the step is waiting on", () => {
    const p = participantProgress(base({ completedStages: ["goals"] }), "2026-01-05");
    expect(p.currentStageOwner).toBe("Line manager");
  });

  it("computes the due date from the cycle start plus the offset", () => {
    const p = participantProgress(base(), "2026-01-05");
    expect(p.stages[1].dueDate).toBe("2026-01-15");
  });

  it("counts days late on the stage somebody is actually sitting on", () => {
    // Manager review was due 15 Jan; today is the 25th.
    const p = participantProgress(base({ completedStages: ["goals"] }), "2026-01-25");
    expect(p.daysLate).toBe(10);
    expect(p.stages[1].overdue).toBe(true);
  });

  it("does not call a future stage late just because its date has passed", () => {
    // The whole point: one stuck appraisal must not report as three failures.
    const p = participantProgress(base({ completedStages: ["goals"] }), "2027-06-01");
    expect(p.stages.filter((s) => s.overdue)).toHaveLength(1);
    expect(p.stages[2].overdue).toBe(false);
  });

  it("is not late on the due date itself", () => {
    const p = participantProgress(base({ completedStages: ["goals"] }), "2026-01-15");
    expect(p.daysLate).toBe(0);
  });

  it("reports a finished appraisal with no current stage and no lateness", () => {
    const p = participantProgress(
      base({ completedStages: ["goals", "review", "final"] }),
      "2028-01-01",
    );
    expect(p.finished).toBe(true);
    expect(p.percentComplete).toBe(100);
    expect(p.currentStageLabel).toBeNull();
    expect(p.daysLate).toBe(0);
  });

  it("drops a stage that does not apply to this employee", () => {
    // A management-only stage must not leave everyone else permanently short.
    const withCondition = [
      ...STAGES,
      stage({ key: "exec", label: "Executive review", condition: "grade:management" }),
    ];
    const p = participantProgress(
      base({ stages: withCondition, completedStages: ["goals", "review", "final"] }),
      "2026-06-01",
    );
    expect(p.totalCount).toBe(3);
    expect(p.finished).toBe(true);
  });

  it("shows every stage of a parallel group as current at once", () => {
    const parallel = [
      stage({ key: "goals", label: "Goals" }),
      stage({ key: "self", label: "Self", parallelGroup: "mid" }),
      stage({ key: "peer", label: "Peer", parallelGroup: "mid" }),
    ];
    const p = participantProgress(
      base({ stages: parallel, completedStages: ["goals"] }),
      "2026-06-01",
    );
    expect(p.stages.filter((s) => s.state === "current").map((s) => s.key)).toEqual(["self", "peer"]);
  });

  it("copes with a cycle that has no stages configured", () => {
    const p = participantProgress(base({ stages: [] }), "2026-06-01");
    expect(p.totalCount).toBe(0);
    expect(p.percentComplete).toBe(0);
    expect(p.finished).toBe(false);
  });
});

describe("summarise", () => {
  const rows = [
    participantProgress(base({ appraisalId: "1", completedStages: ["goals", "review", "final"] }), "2026-06-01"),
    participantProgress(base({ appraisalId: "2", completedStages: ["goals"] }), "2026-06-01"),
    participantProgress(base({ appraisalId: "3", completedStages: [] }), "2026-06-01"),
  ];

  it("splits the population by where each person stands", () => {
    const s = summarise(rows);
    expect(s).toMatchObject({ participants: 3, finished: 1, inProgress: 1, notStarted: 1 });
  });

  it("counts the ones running late", () => {
    // Rows 2 and 3 are both sitting on stages whose dates have passed.
    expect(summarise(rows).overdue).toBe(2);
  });
});

describe("rankForReview", () => {
  it("puts the latest first, then the least advanced", () => {
    const late = participantProgress(base({ appraisalId: "late", employeeName: "Late", completedStages: ["goals"] }), "2026-03-01");
    const early = participantProgress(base({ appraisalId: "ok", employeeName: "Ontime", completedStages: ["goals"] }), "2026-01-02");
    expect(rankForReview([early, late])[0].employeeName).toBe("Late");
  });
});

describe("progressSheetRows", () => {
  const rows = [
    participantProgress(base({ completedStages: ["goals"] }), "2026-01-25"),
    participantProgress(base({ appraisalId: "a2", employeeName: "Alan Bate", completedStages: [] }), "2026-01-25"),
  ];
  const sheet = progressSheetRows(rows);

  it("puts a header first, then one row per participant", () => {
    expect(sheet).toHaveLength(3);
    expect(sheet[0][0]).toBe("Employee");
  });

  it("gives every stage its own column", () => {
    expect(sheet[0]).toContain("Employee defines goals");
    expect(sheet[0]).toContain("Manager final assessment");
  });

  it("writes days late as a number so Excel can sort it", () => {
    const daysLateCol = sheet[0].indexOf("Days late");
    expect(sheet[1][daysLateCol]).toBe(10);
  });

  it("leaves days late blank rather than writing a zero", () => {
    const daysLateCol = sheet[0].indexOf("Days late");
    const onTime = progressSheetRows([
      participantProgress(base({ completedStages: ["goals"] }), "2026-01-10"),
    ]);
    expect(onTime[1][daysLateCol]).toBeNull();
  });

  it("marks a late stage in its own cell", () => {
    const col = sheet[0].indexOf("Manager reviews goals");
    expect(sheet[1][col]).toBe("In progress — 10d late");
  });

  it("marks a stage that does not apply to somebody as n/a", () => {
    const withExec = [...STAGES, stage({ key: "exec", label: "Exec", condition: "grade:management" })];
    const mixed = progressSheetRows([
      participantProgress(base({ stages: withExec, employee: { isManagementGrade: true } }), "2026-01-05"),
      participantProgress(base({ stages: withExec, employeeName: "Not exec" }), "2026-01-05"),
    ]);
    const col = mixed[0].indexOf("Exec");
    expect(mixed[1][col]).not.toBe("n/a");
    expect(mixed[2][col]).toBe("n/a");
  });

  it("shows a finished person as complete with nothing outstanding", () => {
    const done = progressSheetRows([
      participantProgress(base({ completedStages: ["goals", "review", "final"] }), "2026-06-01"),
    ]);
    expect(done[1][4]).toBe("Complete");
    expect(done[1][5]).toBeNull();
  });
});

describe("the legacy ladder — cycles with no workflow template", () => {
  it("covers the eight stages the legacy flow actually runs", () => {
    expect(legacyStages().map((s) => s.key)).toEqual(LEGACY_STAGE_LADDER.map((s) => s.key));
    expect(legacyStages()).toHaveLength(8);
  });

  it("treats everything before the current stage as done", () => {
    expect(legacyCompletedStages("manager_review", "pending_manager_review")).toEqual([
      "goal_setting",
      "goal_review",
      "self_assessment",
    ]);
  });

  it("counts nothing done at the very first stage", () => {
    expect(legacyCompletedStages("goal_setting", "not_started")).toEqual([]);
  });

  it("counts a closed appraisal as finished outright", () => {
    expect(legacyCompletedStages("closed", "closed")).toHaveLength(8);
    expect(legacyCompletedStages("acknowledgement", "closed")).toHaveLength(8);
  });

  it("counts nothing done for an unrecognised stage", () => {
    expect(legacyCompletedStages(null, null)).toEqual([]);
    expect(legacyCompletedStages("nonsense", "draft")).toEqual([]);
  });

  it("reports real progress for the shape production actually holds", () => {
    // 1,904 of 1,907 appraisals sit at goal_setting / not_started.
    const p = participantProgress(
      {
        appraisalId: "a1",
        employeeName: "Zoe Ayuk",
        cycleName: "2026 Annual Appraisal",
        cycleStart: null,
        stages: legacyStages(),
        completedStages: legacyCompletedStages("goal_setting", "not_started"),
        dueDates: { goal_setting: "2026-03-31" },
      },
      "2026-08-06",
    );
    expect(p.currentStageLabel).toBe("Goal setting");
    expect(p.totalCount).toBe(8);
    expect(p.daysLate).toBe(128);
  });

  it("leaves undated stages without a date rather than inventing one", () => {
    const p = participantProgress(
      {
        appraisalId: "a1",
        employeeName: "Zoe Ayuk",
        cycleName: "Cycle",
        cycleStart: null,
        stages: legacyStages(),
        completedStages: [],
      },
      "2026-08-06",
    );
    expect(p.stages.every((s) => s.dueDate === null)).toBe(true);
    expect(p.stages.some((s) => s.overdue)).toBe(false);
    expect(p.daysLate).toBe(0);
  });
});
