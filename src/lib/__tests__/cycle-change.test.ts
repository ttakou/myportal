import { describe, expect, it } from "vitest";
import {
  cycleChangeDone,
  describeCycleChange,
  type CycleChange,
} from "@/lib/performance/cycle-change";

const ctx = { participants: 121, cycleName: "2026 Annual Appraisal" };

describe("describeCycleChange", () => {
  it("says how many people opening a phase affects", () => {
    const t = describeCycleChange({ kind: "open_phase", phase: "Mid Year Review" }, ctx);
    expect(t.title).toBe("Open Mid Year Review?");
    expect(t.consequence).toContain("all 121 people in the cycle");
    expect(t.consequence).toContain("nobody is moved past theirs");
    expect(t.confirmLabel).toBe("Open Mid Year Review");
  });

  it("falls back to 'everybody' when the count is unknown", () => {
    const t = describeCycleChange({ kind: "close_phase", phase: "Goals Setting" }, { participants: null });
    expect(t.consequence).toContain("everybody in the cycle");
    expect(t.consequence).not.toContain("null");
  });

  it("uses the singular for one person", () => {
    const t = describeCycleChange({ kind: "open_phase", phase: "Final Review" }, { participants: 1 });
    expect(t.consequence).toContain("all 1 person in the cycle");
  });

  it("warns that following the dates may change the visible phase", () => {
    const t = describeCycleChange({ kind: "follow_dates" }, ctx);
    expect(t.consequence).toMatch(/different phase/);
  });

  it("names the date being moved, from and to", () => {
    const t = describeCycleChange(
      { kind: "move_boundary", label: "End of Goals Setting", from: "2026-03-01", to: "2026-03-15" },
      ctx,
    );
    expect(t.title).toBe("Move End of Goals Setting from 2026-03-01 to 2026-03-15?");
    expect(t.consequence).toContain("Steps either side shift only as far as the order requires");
  });

  it("copes with a boundary that had no date before", () => {
    const t = describeCycleChange(
      { kind: "move_boundary", label: "End of Calibration", from: null, to: "2026-11-30" },
      ctx,
    );
    expect(t.title).toBe("Move End of Calibration to 2026-11-30?");
  });

  it("says a launch cannot be undone and where reviewers come from", () => {
    const t = describeCycleChange({ kind: "launch_cycle", cycle: "2027 Annual Appraisal" }, ctx);
    expect(t.consequence).toContain("reporting line");
    expect(t.consequence).toContain("cannot be undone");
  });

  it("says closing a cycle makes it read-only", () => {
    const t = describeCycleChange({ kind: "close_cycle", cycle: "2026 Annual Appraisal" }, ctx);
    expect(t.consequence).toContain("read-only");
    expect(t.confirmLabel).toBe("Close 2026 Annual Appraisal");
  });
});

describe("cycleChangeDone", () => {
  it.each<[CycleChange, string]>([
    [{ kind: "open_phase", phase: "Mid Year Review" }, "Mid Year Review is open."],
    [{ kind: "close_phase", phase: "Mid Year Review" }, "Mid Year Review is closed."],
    [{ kind: "follow_dates" }, "The open phase now follows the dates."],
    [{ kind: "move_boundary", label: "End of X", from: null, to: "2026-05-01" }, "End of X moved to 2026-05-01."],
    [{ kind: "launch_cycle", cycle: "C" }, "C launched."],
    [{ kind: "close_cycle", cycle: "C" }, "C closed."],
  ])("reports %o as done", (change, expected) => {
    expect(cycleChangeDone(change)).toBe(expected);
  });
});
