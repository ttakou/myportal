import { describe, expect, it } from "vitest";
import {
  describeContent,
  isEmptyAppraisal,
  partitionStray,
  type StrayAppraisal,
  type StrayContent,
} from "@/lib/performance/stray-appraisals";

const empty: StrayContent = {
  goals: 0,
  events: 0,
  developmentPlans: 0,
  competencyRatings: 0,
  appeals: 0,
  calibrationAdjustments: 0,
  continuousLinks: 0,
  managerSummary: false,
  employeeSummary: false,
  rated: false,
  discussed: false,
  acknowledged: false,
};

const row = (name: string, over: Partial<StrayContent> = {}): StrayAppraisal => ({
  appraisalId: `a-${name}`,
  employeeName: name,
  content: { ...empty, ...over },
});

describe("isEmptyAppraisal", () => {
  it("is empty when nothing was written, taken or rated", () => {
    expect(isEmptyAppraisal(empty)).toBe(true);
  });

  it.each<[string, Partial<StrayContent>]>([
    ["a goal", { goals: 1 }],
    ["a step taken", { events: 1 }],
    ["a development plan", { developmentPlans: 1 }],
    ["a competency rating", { competencyRatings: 1 }],
    ["an appeal", { appeals: 1 }],
    ["a calibration adjustment", { calibrationAdjustments: 1 }],
    ["a manager comment", { managerSummary: true }],
    ["a self-assessment", { employeeSummary: true }],
    ["a rating", { rated: true }],
    ["a recorded discussion", { discussed: true }],
    ["an acknowledgement", { acknowledged: true }],
  ])("is not empty with %s", (_label, over) => {
    expect(isEmptyAppraisal({ ...empty, ...over })).toBe(false);
  });

  it("ignores continuous entries pointing at it", () => {
    // They belong to the person and are unlinked, not deleted, so they must
    // not hold an otherwise empty appraisal in place.
    expect(isEmptyAppraisal({ ...empty, continuousLinks: 3 })).toBe(true);
  });
});

describe("partitionStray", () => {
  it("clears the empty ones and keeps the rest with a reason", () => {
    const { clearable, kept } = partitionStray([
      row("Agendia"),
      row("Alex", { goals: 4, events: 1, developmentPlans: 1 }),
      row("Bless"),
    ]);
    expect(clearable.map((r) => r.employeeName)).toEqual(["Agendia", "Bless"]);
    expect(kept).toEqual([
      { appraisalId: "a-Alex", employeeName: "Alex", holds: "4 goals, 1 step and 1 development plan" },
    ]);
  });

  it("keeps everything when nothing is empty", () => {
    const { clearable, kept } = partitionStray([row("A", { managerSummary: true })]);
    expect(clearable).toEqual([]);
    expect(kept[0].holds).toBe("a manager comment");
  });

  it("does nothing with nothing", () => {
    expect(partitionStray([])).toEqual({ clearable: [], kept: [] });
  });
});

describe("describeContent", () => {
  it("reads as a sentence", () => {
    expect(describeContent({ ...empty, goals: 1 })).toBe("1 goal");
    expect(describeContent({ ...empty, goals: 2, rated: true })).toBe("2 goals and a rating");
    expect(describeContent(empty)).toBe("nothing");
  });
});
