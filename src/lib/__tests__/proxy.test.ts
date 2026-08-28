import { describe, expect, it } from "vitest";
import { actingForLabel, mayProxy, proxyTrail } from "@/lib/performance/proxy";

describe("actingForLabel", () => {
  const names = { employee: "Flora Tankoua", manager: "Eban Bate", secondLevel: "Qinghe Xing" };

  it("names the person whose step it is", () => {
    expect(actingForLabel("employee", names)).toBe("Flora Tankoua · Employee");
    expect(actingForLabel("line_manager", names)).toBe("Eban Bate · Line manager");
    expect(actingForLabel("second_level", names)).toBe("Qinghe Xing · Second-level manager");
  });

  it("falls back to the role when the seat is empty", () => {
    expect(actingForLabel("line_manager", { manager: null })).toBe("Line manager");
    expect(actingForLabel("employee")).toBe("Employee");
  });

  it("falls back to the role for steps nobody is named on", () => {
    // HR, calibration and the PGM are roles, not seats on the appraisal.
    expect(actingForLabel("hr", names)).toBe("HR");
    expect(actingForLabel("calibration", names)).toBe("Calibration committee");
    expect(actingForLabel("pgm", names)).toBe("PGM");
  });

  it("ignores a blank name rather than printing a stray separator", () => {
    expect(actingForLabel("employee", { employee: "   " })).toBe("Employee");
  });
});

describe("proxyTrail", () => {
  const events = [
    { id: "1", on_behalf_of_name: null, created_at: "2026-03-01T09:00:00Z" },
    { id: "2", on_behalf_of_name: "Flora Tankoua", created_at: "2026-03-02T09:00:00Z" },
    { id: "3", on_behalf_of_name: "Eban Bate", created_at: "2026-03-05T09:00:00Z" },
    { id: "4", on_behalf_of_name: null, created_at: "2026-03-06T09:00:00Z" },
  ];

  it("keeps only the steps taken for somebody else", () => {
    expect(proxyTrail(events).map((e) => e.id)).toEqual(["3", "2"]);
  });

  it("puts the most recent first", () => {
    expect(proxyTrail(events)[0].created_at).toBe("2026-03-05T09:00:00Z");
  });

  it("leaves the caller's array alone", () => {
    const before = events.map((e) => e.id);
    proxyTrail(events);
    expect(events.map((e) => e.id)).toEqual(before);
  });

  it("is empty when nobody has stood in", () => {
    expect(proxyTrail([{ on_behalf_of_name: null, created_at: "2026-01-01T00:00:00Z" }])).toEqual([]);
  });
});

describe("mayProxy", () => {
  const admin = "admin-1";
  const someone = "employee-9";

  it("lets an administrator act for somebody else", () => {
    expect(mayProxy({ isAdmin: true, viewerId: admin, employeeId: someone })).toBe(true);
  });

  it("refuses on their own appraisal", () => {
    // The case that prompted this: an HR admin approved the manager's review
    // step on their own record. The audit trail named them as acting for their
    // own manager, which describes the problem rather than preventing it.
    expect(mayProxy({ isAdmin: true, viewerId: admin, employeeId: admin })).toBe(false);
  });

  it("gives nothing to somebody who is not an administrator", () => {
    expect(mayProxy({ isAdmin: false, viewerId: admin, employeeId: someone })).toBe(false);
  });

  it("refuses when nobody is signed in", () => {
    expect(mayProxy({ isAdmin: true, viewerId: null, employeeId: someone })).toBe(false);
  });

  it("does not treat an unowned appraisal as the viewer's own", () => {
    // employeeId null must not collapse into "this is mine" and grant proxy by
    // accident — nor deny it: an appraisal with no employee is somebody else's
    // problem, and an administrator may still act.
    expect(mayProxy({ isAdmin: true, viewerId: admin, employeeId: null })).toBe(true);
  });
});
