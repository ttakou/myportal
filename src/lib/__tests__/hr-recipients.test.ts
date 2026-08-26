import { describe, expect, it } from "vitest";
import {
  needsHrRecipients,
  pickHrRecipients,
  pickPgmRecipients,
  type RoleHolder,
} from "@/lib/performance/hr-recipients";

const holder = (profile_id: string, role: string): RoleHolder => ({ profile_id, role });

describe("pickHrRecipients", () => {
  it("addresses HR admins", () => {
    expect(
      pickHrRecipients([holder("a", "hr_admin"), holder("b", "hr_admin"), holder("c", "finance")]),
    ).toEqual(["a", "b"]);
  });

  it("leaves system admins out when HR admins exist", () => {
    // A technical role should not be copied on every calibration notice.
    expect(pickHrRecipients([holder("a", "hr_admin"), holder("z", "system_admin")])).toEqual(["a"]);
  });

  it("falls back to system admins when nobody holds the HR role", () => {
    // Reaching the wrong inbox beats reaching none — silence is the bug this
    // module exists to prevent.
    expect(pickHrRecipients([holder("z", "system_admin")])).toEqual(["z"]);
  });

  it("returns nobody when the tenant has neither", () => {
    expect(pickHrRecipients([holder("c", "finance")])).toEqual([]);
    expect(pickHrRecipients([])).toEqual([]);
  });

  it("does not address the same person twice", () => {
    expect(pickHrRecipients([holder("a", "hr_admin"), holder("a", "hr_admin")])).toEqual(["a"]);
  });
});

describe("pickPgmRecipients", () => {
  it("addresses whoever holds the PGM role", () => {
    expect(pickPgmRecipients([holder("p", "pgm"), holder("h", "hr_admin")])).toEqual(["p"]);
  });

  it("falls back to HR admins, who may also record the final rating", () => {
    expect(pickPgmRecipients([holder("h", "hr_admin")])).toEqual(["h"]);
  });

  it("falls all the way back to system admins rather than reaching nobody", () => {
    expect(pickPgmRecipients([holder("z", "system_admin")])).toEqual(["z"]);
  });

  it("returns nobody when the tenant holds none of those roles", () => {
    expect(pickPgmRecipients([holder("f", "finance")])).toEqual([]);
  });
});

describe("needsHrRecipients", () => {
  it("is true when a rule is addressed to HR", () => {
    expect(needsHrRecipients([{ recipients: ["hr", "line_manager"] }])).toBe(true);
  });

  it("is true for the calibration committee, which is also a role", () => {
    expect(needsHrRecipients([{ recipients: ["calibration"] }])).toBe(true);
  });

  it("is true for the PGM, which is a role too", () => {
    expect(needsHrRecipients([{ recipients: ["pgm"] }])).toBe(true);
  });

  it("is false when every recipient is somebody named on the appraisal", () => {
    // No lookup should happen for these — the ids are already to hand.
    expect(needsHrRecipients([{ recipients: ["employee"] }, { recipients: ["line_manager"] }])).toBe(
      false,
    );
  });

  it("is false with no rules at all", () => {
    expect(needsHrRecipients([])).toBe(false);
  });
});
