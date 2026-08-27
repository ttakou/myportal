import { describe, expect, it } from "vitest";
import { NO_PHASE_OPEN, cyclePhases, phaseNameOf } from "@/lib/performance/cycle-phases";
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
    expect(phasesOn("2026-01-01").map((p) => p.stageCount)).toEqual([4, 4, 4, 1, 1]);
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

describe("an explicitly opened phase", () => {
  const open = (openPhase: string | null, todayIso = "2026-08-26") =>
    cyclePhases({ stages: HOUSE_PHASES, cycleStart: CYCLE_START, todayIso, openPhase });

  it("wins over the dates", () => {
    // The dates put the cycle in Final Review; the work is at mid-year, and it
    // is the work that matters.
    expect(currentOn("2026-08-26")).toBe("Final Review");
    expect(open("Mid Year Review").find((p) => p.state === "current")?.name).toBe(
      "Mid Year Review",
    );
  });

  it("closes what came before it and leaves the rest upcoming", () => {
    expect(open("Mid Year Review").map((p) => p.state)).toEqual([
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("can hold a phase open past its own date", () => {
    // Mid Year Review closed on 30 June. Opening it says the work is still
    // there, which is the whole point.
    const phases = open("Mid Year Review");
    const mid = phases.find((p) => p.name === "Mid Year Review")!;
    expect(mid.dueDate).toBe("2026-06-30");
    expect(mid.state).toBe("current");
  });

  it("can open a phase whose date has not arrived", () => {
    expect(open("Annual Calibration", "2026-02-01").map((p) => p.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "upcoming",
    ]);
  });

  it("still marks exactly one phase current", () => {
    for (const name of ["Goals Setting", "Final Appraisal", "Annual Calibration"]) {
      expect(open(name).filter((p) => p.state === "current")).toHaveLength(1);
    }
  });

  it("falls back to the dates when the named phase is not in this cycle", () => {
    // A phase renamed in the template must not leave the cycle showing nothing.
    expect(open("Nonexistent Phase").find((p) => p.state === "current")?.name).toBe("Final Review");
  });

  it("falls back to the dates when nothing is open", () => {
    expect(open(null).find((p) => p.state === "current")?.name).toBe("Final Review");
  });
});

describe("cyclePhases — phase spans", () => {
  const phases = phasesOn("2026-01-01");

  it("starts the first phase with the cycle", () => {
    expect(phases[0].startDate).toBe(CYCLE_START);
  });

  it("starts each later phase the day after the one before it closed", () => {
    for (let i = 1; i < phases.length; i++) {
      const prevEnd = new Date(`${phases[i - 1].dueDate}T00:00:00Z`);
      prevEnd.setUTCDate(prevEnd.getUTCDate() + 1);
      expect(phases[i].startDate).toBe(prevEnd.toISOString().slice(0, 10));
    }
  });

  it("never starts a phase after it is due to close", () => {
    for (const p of phases) {
      expect(p.startDate! <= p.dueDate!).toBe(true);
    }
  });

  it("has no dates at all when the cycle has no start", () => {
    const undated = cyclePhases({ stages: HOUSE_PHASES, cycleStart: null, todayIso: "2026-06-01" });
    expect(undated.every((p) => p.startDate === null && p.dueDate === null)).toBe(true);
  });
});

describe("cyclePhases — every phase explicitly closed", () => {
  const closed = (todayIso: string) =>
    cyclePhases({
      stages: HOUSE_PHASES,
      cycleStart: CYCLE_START,
      todayIso,
      openPhase: NO_PHASE_OPEN,
    });

  it("leaves nothing open", () => {
    expect(closed("2026-06-01").some((p) => p.state === "current")).toBe(false);
  });

  it("is not the same as having no preference — the dates would open one", () => {
    expect(currentOn("2026-06-01")).toBeDefined();
  });

  it("still shows which phases are behind us", () => {
    const states = closed("2026-06-01").map((p) => p.state);
    // Goal setting closed on 2026-03-31; everything later is still ahead.
    expect(states).toEqual(["done", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("closes the final phase too, which opening another never could", () => {
    expect(closed("2027-01-01").every((p) => p.state === "done")).toBe(true);
  });

  it("keeps the spans regardless", () => {
    expect(closed("2026-06-01")[0].startDate).toBe(CYCLE_START);
  });
});
