import { describe, expect, it } from "vitest";
import { cyclePhases, phaseNameOf } from "@/lib/performance/cycle-phases";
import { HOUSE_PHASES } from "@/types/workflow";

const CYCLE_START = "2026-01-01";
const phasesOn = (todayIso: string) =>
  cyclePhases({ stages: HOUSE_PHASES, cycleStart: CYCLE_START, todayIso });
const currentOn = (todayIso: string) => phasesOn(todayIso).find((p) => p.state === "current")?.name;

describe("phaseNameOf", () => {
  it("takes everything before the dash", () => {
    expect(phaseNameOf("Goals Setting — employee submits")).toBe("Goals Setting");
  });

  it("keeps a label that has no step suffix", () => {
    expect(phaseNameOf("Annual Calibration")).toBe("Annual Calibration");
  });

  it("copes with a plain hyphen or an en dash", () => {
    expect(phaseNameOf("Final Review - manager sign-off")).toBe("Final Review");
    expect(phaseNameOf("Final Review – manager sign-off")).toBe("Final Review");
  });
});

describe("cyclePhases", () => {
  it("groups the sixteen stages back into the five phases", () => {
    expect(phasesOn("2026-01-01").map((p) => p.name)).toEqual([
      "Goals Setting",
      "Mid Year Review",
      "Final Review",
      "Annual Calibration",
      "Final Appraisal",
    ]);
  });

  it("counts the steps in each phase", () => {
    expect(phasesOn("2026-01-01").map((p) => p.stageCount)).toEqual([4, 4, 4, 1, 3]);
  });

  it("closes a phase on the due date of its last step", () => {
    expect(phasesOn("2026-01-01").map((p) => p.dueDate)).toEqual([
      "2026-03-31",
      "2026-06-30",
      "2026-12-05",
      "2026-12-15",
      "2026-12-31",
    ]);
  });

  it("puts the cycle in its first phase at the start of the year", () => {
    expect(currentOn("2026-01-01")).toBe("Goals Setting");
  });

  it("keeps a phase current right up to its closing date", () => {
    expect(currentOn("2026-03-31")).toBe("Goals Setting");
  });

  it("moves on the day after a phase closes", () => {
    expect(currentOn("2026-04-01")).toBe("Mid Year Review");
  });

  it("tracks the cycle through the year", () => {
    expect(currentOn("2026-08-26")).toBe("Final Review");
    expect(currentOn("2026-12-10")).toBe("Annual Calibration");
    expect(currentOn("2026-12-20")).toBe("Final Appraisal");
  });

  it("marks the phases behind it closed and the ones ahead upcoming", () => {
    const phases = phasesOn("2026-08-26");
    expect(phases.map((p) => p.state)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("leaves the last phase current once the year has run out", () => {
    // Better than showing no phase at all: an overrun cycle is still sitting in
    // its final phase, and somebody has to be chased for it.
    expect(currentOn("2027-06-01")).toBe("Final Appraisal");
    expect(phasesOn("2027-06-01").filter((p) => p.state === "current")).toHaveLength(1);
  });

  it("marks exactly one phase current, whatever the date", () => {
    for (const today of ["2026-01-01", "2026-06-30", "2026-12-15", "2030-01-01"]) {
      expect(phasesOn(today).filter((p) => p.state === "current")).toHaveLength(1);
    }
  });

  it("has no dates, and starts at the first phase, without a cycle start", () => {
    const phases = cyclePhases({ stages: HOUSE_PHASES, cycleStart: null, todayIso: "2026-08-26" });
    expect(phases.every((p) => p.dueDate === null)).toBe(true);
    expect(phases[0].state).toBe("current");
  });

  it("returns nothing for a cycle with no stages", () => {
    expect(cyclePhases({ stages: [], cycleStart: CYCLE_START, todayIso: "2026-08-26" })).toEqual([]);
  });

  it("does not merge a phase name that reappears after a gap", () => {
    const stages = [
      { ...HOUSE_PHASES[0], key: "a", label: "Review — one" },
      { ...HOUSE_PHASES[0], key: "b", label: "Other — step" },
      { ...HOUSE_PHASES[0], key: "c", label: "Review — two" },
    ];
    expect(cyclePhases({ stages, cycleStart: CYCLE_START, todayIso: "2026-01-01" })).toHaveLength(3);
  });
});
