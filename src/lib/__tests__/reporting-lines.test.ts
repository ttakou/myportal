import { describe, expect, it } from "vitest";
import {
  filterReportingLines,
  rowIssues,
  sortReportingLines,
  summariseReportingLines,
  type ReportingLineRow,
} from "@/lib/performance/reporting-lines";

const row = (over: Partial<ReportingLineRow> & { name: string }): ReportingLineRow => ({
  profileId: `p-${over.name}`,
  department: "Finance & IT",
  jobTitle: null,
  managerId: "huimin",
  managerName: "Huimin.Liu",
  appraisalId: `a-${over.name}`,
  reviewerId: "huimin",
  reviewerName: "Huimin.Liu",
  ...over,
});

describe("rowIssues", () => {
  it("finds nothing wrong when profile and appraisal agree", () => {
    expect(rowIssues(row({ name: "Alex" }))).toEqual([]);
  });

  it("flags a profile with no manager", () => {
    expect(rowIssues(row({ name: "Patrick", managerId: null, managerName: null }))).toContain(
      "no_manager",
    );
  });

  it("flags an appraisal naming no reviewer", () => {
    // Helen's case: the profile knows, the appraisal does not.
    expect(rowIssues(row({ name: "Helen", reviewerId: null, reviewerName: null }))).toEqual([
      "no_reviewer",
    ]);
  });

  it("flags a reviewer who is not the line manager", () => {
    expect(rowIssues(row({ name: "Marlyse", reviewerId: "ivo", reviewerName: "Ivo.Mesumbe" }))).toEqual(
      ["differs"],
    );
  });

  it("does not call an empty reviewer a difference when the profile is empty too", () => {
    const r = row({ name: "Eric", managerId: null, managerName: null, reviewerId: null, reviewerName: null });
    expect(rowIssues(r)).toEqual(["no_manager", "no_reviewer"]);
  });

  it("ignores the reviewer for somebody not in the cycle", () => {
    expect(rowIssues(row({ name: "Out", appraisalId: null, reviewerId: null }))).toEqual([]);
  });
});

describe("summariseReportingLines", () => {
  it("counts each kind of problem and the rows with none", () => {
    const s = summariseReportingLines([
      row({ name: "A" }),
      row({ name: "B", managerId: null, managerName: null }),
      row({ name: "C", reviewerId: null }),
      row({ name: "D", reviewerId: "ivo" }),
    ]);
    expect(s).toEqual({ staff: 4, noManager: 1, noReviewer: 1, differs: 1, consistent: 1 });
  });
});

describe("filterReportingLines", () => {
  const rows = [
    row({ name: "Helen.Arrey", reviewerId: null, department: "Business Planning" }),
    row({ name: "Alex Takou" }),
  ];

  it("keeps everything on 'all' with no query", () => {
    expect(filterReportingLines(rows, "all", "")).toHaveLength(2);
  });

  it("narrows to one kind of problem", () => {
    expect(filterReportingLines(rows, "no_reviewer", "").map((r) => r.name)).toEqual(["Helen.Arrey"]);
  });

  it("searches name, department and manager", () => {
    expect(filterReportingLines(rows, "all", "planning").map((r) => r.name)).toEqual(["Helen.Arrey"]);
    expect(filterReportingLines(rows, "all", "huimin")).toHaveLength(2);
    expect(filterReportingLines(rows, "all", "zzz")).toHaveLength(0);
  });
});

describe("sortReportingLines", () => {
  it("orders by name, case-insensitively", () => {
    const sorted = sortReportingLines([row({ name: "bob" }), row({ name: "Alice" }), row({ name: "alan" })]);
    expect(sorted.map((r) => r.name)).toEqual(["alan", "Alice", "bob"]);
  });
});
