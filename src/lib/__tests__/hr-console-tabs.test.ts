import { describe, expect, it } from "vitest";
import {
  DEFAULT_HR_TAB,
  HR_CONSOLE_TABS,
  hrTabHref,
  resolveHrTab,
} from "@/lib/performance/hr-console-tabs";

describe("HR_CONSOLE_TABS", () => {
  it("names the tabs HR asked for, in a sensible order", () => {
    expect(HR_CONSOLE_TABS.map((t) => t.key)).toEqual([
      "dashboard",
      "cycle",
      "appraisals",
      "managers",
      "competencies",
      "objectives",
      "bands",
      "calibration",
    ]);
  });

  it("gives every tab a label and a one-line description", () => {
    for (const t of HR_CONSOLE_TABS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("has unique keys", () => {
    expect(new Set(HR_CONSOLE_TABS.map((t) => t.key)).size).toBe(HR_CONSOLE_TABS.length);
  });
});

describe("resolveHrTab", () => {
  it("accepts a known tab", () => {
    expect(resolveHrTab("competencies")).toBe("competencies");
  });

  it("falls back to the dashboard for anything else", () => {
    // A stale bookmark or a typo lands somewhere useful, not on a blank page.
    expect(resolveHrTab("nope")).toBe(DEFAULT_HR_TAB);
    expect(resolveHrTab(null)).toBe(DEFAULT_HR_TAB);
    expect(resolveHrTab(undefined)).toBe(DEFAULT_HR_TAB);
    expect(resolveHrTab("")).toBe(DEFAULT_HR_TAB);
  });
});

describe("hrTabHref", () => {
  it("keeps the default tab on the sidebar's own URL", () => {
    // The sidebar matches its HR console item by href; the dashboard tab must
    // be that same URL or the item stops lighting up.
    expect(hrTabHref("dashboard")).toBe("/performance/appraisals?view=hr");
  });

  it("names any other tab in the URL", () => {
    expect(hrTabHref("objectives")).toBe("/performance/appraisals?view=hr&tab=objectives");
  });

  it("carries the cycle being looked at", () => {
    expect(hrTabHref("cycle", "c1")).toBe("/performance/appraisals?view=hr&tab=cycle&cycle=c1");
    expect(hrTabHref("dashboard", "c1")).toBe("/performance/appraisals?view=hr&cycle=c1");
  });

  it("drops an empty cycle", () => {
    expect(hrTabHref("bands", null)).toBe("/performance/appraisals?view=hr&tab=bands");
  });
});
