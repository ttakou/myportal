import { describe, expect, it } from "vitest";
import { confirmStep, noShowEffect, TRAVELLED } from "@/lib/offshore/run-reconcile";

const base = { scheduledDate: "2026-11-24", today: "2026-11-24", hasRecord: true };

describe("a no-show after the night run has moved people", () => {
  it("takes an arrival who never came off POB, and puts them back if cleared", () => {
    expect(noShowEffect({ ...base, direction: "out", noShow: true })).toBe("take-off");
    expect(noShowEffect({ ...base, direction: "out", noShow: false })).toBe("put-back-on");
  });

  it("keeps a leaver who stayed on board, and sends them home if cleared", () => {
    expect(noShowEffect({ ...base, direction: "in", noShow: true })).toBe("keep-aboard");
    expect(noShowEffect({ ...base, direction: "in", noShow: false })).toBe("send-home");
  });

  it("only marks the name when nothing has moved, or the run is for a later day", () => {
    expect(noShowEffect({ ...base, direction: "out", noShow: true, hasRecord: false })).toBe("flag-only");
    expect(noShowEffect({ ...base, direction: "out", noShow: true, scheduledDate: "2026-11-25" })).toBe("flag-only");
  });
});

describe("confirming a run", () => {
  it("boards whoever is not aboard yet on a MOB run, and leaves no-shows alone", () => {
    expect(confirmStep({ direction: "out", noShow: false, aboard: false, leftOnDay: false })).toBe("board");
    expect(confirmStep({ direction: "out", noShow: false, aboard: true, leftOnDay: false })).toBe("already-aboard");
    expect(confirmStep({ direction: "out", noShow: true, aboard: false, leftOnDay: false })).toBe("skip");
  });

  it("sends home whoever is still aboard on a DEMOB run, and ignores people who were never aboard", () => {
    expect(confirmStep({ direction: "in", noShow: false, aboard: true, leftOnDay: false })).toBe("send-home");
    expect(confirmStep({ direction: "in", noShow: false, aboard: false, leftOnDay: true })).toBe("already-left");
    expect(confirmStep({ direction: "in", noShow: false, aboard: false, leftOnDay: false })).toBe("not-aboard");
  });

  it("ticks as travelled only those who actually moved", () => {
    expect(TRAVELLED.has("board")).toBe(true);
    expect(TRAVELLED.has("already-left")).toBe(true);
    expect(TRAVELLED.has("not-aboard")).toBe(false);
    expect(TRAVELLED.has("skip")).toBe(false);
  });
});
