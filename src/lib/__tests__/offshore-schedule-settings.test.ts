import { describe, expect, it } from "vitest";
import { describeNightlySwitch, scheduleActs } from "@/lib/offshore/schedule-settings";

describe("scheduleActs", () => {
  it("acts only when the mode is automatic and the overnight switch is on", () => {
    expect(scheduleActs({ mode: "auto", nightly: "act" })).toBe(true);
    expect(scheduleActs({ mode: "auto", nightly: "prompt" })).toBe(false);
    // Manual mode means "set up by hand": a job may not board people.
    expect(scheduleActs({ mode: "manual", nightly: "act" })).toBe(false);
  });
});

describe("describeNightlySwitch", () => {
  it("says what turning it on will do, with the hour", () => {
    const t = describeNightlySwitch("act");
    expect(t.title).toMatch(/act overnight/);
    expect(t.consequence).toContain("04:00 UTC");
    expect(t.consequence).toMatch(/board each crew/);
    expect(t.confirmLabel).toBe("Let the schedule act");
  });

  it("says what turning it off keeps", () => {
    const t = describeNightlySwitch("prompt");
    expect(t.consequence).toMatch(/still remind/);
    expect(t.confirmLabel).toBe("Prompt only");
  });
});
