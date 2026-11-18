import { describe, expect, it } from "vitest";
import { eachDay, peakDuring, pobOutlook, staysOn, visitStay, type OutlookCrew } from "@/lib/offshore/pob-outlook";

const juliet = { id: "J", name: "Juliet", capacity: 4 };
// 3 days on, 3 off, starting 1 Dec: on 1–3, off 4–6, on 7–9.
const crewA: OutlookCrew = { id: "A", name: "A", installationId: "J", offshore_days: 3, onshore_days: 3, cycle_start_date: "2026-12-01", members: ["a1", "a2"] };
// The opposite half: on 4–6.
const crewB: OutlookCrew = { id: "B", name: "B", installationId: "J", offshore_days: 3, onshore_days: 3, cycle_start_date: "2026-12-04", members: ["b1", "b2"] };

describe("days and stays", () => {
  it("counts the arrival day but not the departure day", () => {
    expect(eachDay("2026-12-01", "2026-12-03")).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    expect(staysOn({ from: "2026-12-03", to: "2026-12-05" }, "2026-12-03")).toBe(true);
    expect(staysOn({ from: "2026-12-03", to: "2026-12-05" }, "2026-12-05")).toBe(false);
    expect(staysOn({ from: "2026-12-03", to: null }, "2026-12-30")).toBe(true);
  });

  it("counts a day visit on its day", () => {
    expect(visitStay("2026-12-02", null)).toEqual({ from: "2026-12-02", to: "2026-12-03" });
    expect(visitStay("2026-12-02", "2026-12-02")).toEqual({ from: "2026-12-02", to: "2026-12-03" });
    expect(visitStay("2026-12-02", "2026-12-05")).toEqual({ from: "2026-12-02", to: "2026-12-05" });
  });
});

describe("POB outlook", () => {
  const run = (stays: Parameters<typeof pobOutlook>[0]["stays"]) =>
    pobOutlook({ from: "2026-12-01", to: "2026-12-07", installations: [juliet], crews: [crewA, crewB], stays, defaultInstallationId: "J" })[0];

  it("places crews by their schedule and marks the crew changes", () => {
    const o = run([]);
    expect(o.days.map((d) => d.total)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    const change = o.days.find((d) => d.date === "2026-12-04")!;
    expect(change).toMatchObject({ mob: 2, demob: 2, rotational: 2 });
    expect(o.days.find((d) => d.date === "2026-12-02")).toMatchObject({ mob: 0, demob: 0 });
  });

  it("adds booked people, counts a scheduled member once, and flags the limit", () => {
    const o = run([
      { person: "t:contractor", installationId: null, from: "2026-12-02", to: "2026-12-05", pending: false },
      { person: "v:visitor", installationId: "J", from: "2026-12-03", to: "2026-12-04", pending: false },
      // A member already on board by schedule, with a trip too: still one.
      { person: "p:a1", installationId: "J", from: "2026-12-01", to: "2026-12-04", pending: false },
    ]);
    const d3 = o.days.find((d) => d.date === "2026-12-03")!;
    expect(d3.total).toBe(4);
    expect(d3.over).toBe(false);
    expect(o.peak).toBe(4);
  });

  it("shows pending requests apart and what they would do to the limit", () => {
    const o = run([
      { person: "t:x", installationId: "J", from: "2026-12-02", to: "2026-12-03", pending: false },
      { person: "v:p1", installationId: "J", from: "2026-12-02", to: "2026-12-03", pending: true },
      { person: "v:p2", installationId: "J", from: "2026-12-02", to: "2026-12-03", pending: true },
    ]);
    const d2 = o.days.find((d) => d.date === "2026-12-02")!;
    expect(d2).toMatchObject({ total: 3, pending: 2, over: false, overIfApproved: true });
  });

  it("gives a request its peak day during the stay", () => {
    const o = pobOutlook({
      from: "2026-12-01",
      to: "2026-12-07",
      installations: [juliet],
      crews: [crewA, crewB],
      stays: [{ person: "t:x", installationId: "J", from: "2026-12-05", to: "2026-12-07", pending: false }],
      defaultInstallationId: "J",
    });
    expect(peakDuring(o, "J", { from: "2026-12-04", to: "2026-12-07" }, false)).toEqual({ peak: 3, capacity: 4, date: "2026-12-05", over: false });
    expect(peakDuring(o, "J", { from: "2026-12-05", to: "2026-12-06" }, true)).toMatchObject({ peak: 4, over: false });
    expect(peakDuring(o, "nowhere", { from: "2026-12-05", to: "2026-12-06" }, true)).toBeNull();
  });
});
