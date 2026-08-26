import { describe, expect, it } from "vitest";
import {
  daysBetween,
  deadlineEventFor,
  deadlinePhrase,
  ruleFiresToday,
  type ScheduledRule,
} from "@/lib/performance/deadline-notices";

const rule = (over: Partial<ScheduledRule> = {}): ScheduledRule => ({
  timing: "before",
  offsetDays: 3,
  frequency: "daily",
  ...over,
});

describe("daysBetween", () => {
  it("counts forward", () => {
    expect(daysBetween("2026-08-01", "2026-08-04")).toBe(3);
  });

  it("counts backward as negative", () => {
    expect(daysBetween("2026-08-04", "2026-08-01")).toBe(-3);
  });

  it("is unaffected by a daylight-saving shift", () => {
    // March in a European timezone: naive arithmetic would give 30.958 days.
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
  });
});

describe("ruleFiresToday — the live '3 days before, daily' rule", () => {
  const live = rule({ timing: "before", offsetDays: 3, frequency: "daily" });

  it("stays quiet while the deadline is far off", () => {
    expect(ruleFiresToday(live, { dueDate: "2026-08-20", today: "2026-08-10" })).toBe(false);
  });

  it("starts warning three days out", () => {
    expect(ruleFiresToday(live, { dueDate: "2026-08-20", today: "2026-08-17" })).toBe(true);
  });

  it("keeps warning every day up to the deadline", () => {
    for (const today of ["2026-08-18", "2026-08-19", "2026-08-20"]) {
      expect(ruleFiresToday(live, { dueDate: "2026-08-20", today })).toBe(true);
    }
  });

  it("stops once the deadline has passed — that is the chase rule's job", () => {
    expect(ruleFiresToday(live, { dueDate: "2026-08-20", today: "2026-08-21" })).toBe(false);
  });
});

describe("ruleFiresToday — the live 'overdue, daily' rule", () => {
  const live = rule({ timing: "after", offsetDays: 0, frequency: "daily" });

  it("says nothing before the deadline", () => {
    expect(ruleFiresToday(live, { dueDate: "2026-08-20", today: "2026-08-19" })).toBe(false);
  });

  it("fires on the day itself, with a zero offset", () => {
    expect(ruleFiresToday(live, { dueDate: "2026-08-20", today: "2026-08-20" })).toBe(true);
  });

  it("keeps chasing for as long as the step is not taken", () => {
    expect(ruleFiresToday(live, { dueDate: "2026-08-20", today: "2026-10-01" })).toBe(true);
  });
});

describe("ruleFiresToday — one-off rules", () => {
  it("speaks on exactly its day, before the deadline", () => {
    const once = rule({ timing: "before", offsetDays: 7, frequency: "once" });
    expect(ruleFiresToday(once, { dueDate: "2026-08-20", today: "2026-08-13" })).toBe(true);
    expect(ruleFiresToday(once, { dueDate: "2026-08-20", today: "2026-08-12" })).toBe(false);
    expect(ruleFiresToday(once, { dueDate: "2026-08-20", today: "2026-08-14" })).toBe(false);
  });

  it("speaks on exactly its day, after the deadline", () => {
    const once = rule({ timing: "after", offsetDays: 5, frequency: "once" });
    expect(ruleFiresToday(once, { dueDate: "2026-08-20", today: "2026-08-25" })).toBe(true);
    expect(ruleFiresToday(once, { dueDate: "2026-08-20", today: "2026-08-26" })).toBe(false);
  });
});

describe("ruleFiresToday — edges", () => {
  it("treats until_complete like daily", () => {
    const r = rule({ timing: "after", offsetDays: 2, frequency: "until_complete" });
    expect(ruleFiresToday(r, { dueDate: "2026-08-20", today: "2026-09-20" })).toBe(true);
  });

  it("never fires an immediate rule from the sweep", () => {
    // Immediate rules belong to the action that triggers them; firing them here
    // as well would double every message.
    const r = rule({ timing: "immediate", offsetDays: 0, frequency: "once" });
    expect(ruleFiresToday(r, { dueDate: "2026-08-20", today: "2026-08-20" })).toBe(false);
  });

  it("treats a negative offset as zero rather than firing backwards", () => {
    const r = rule({ timing: "after", offsetDays: -5, frequency: "once" });
    expect(ruleFiresToday(r, { dueDate: "2026-08-20", today: "2026-08-20" })).toBe(true);
  });
});

describe("deadlineEventFor", () => {
  it("warns while there is still time", () => {
    expect(deadlineEventFor({ dueDate: "2026-08-20", today: "2026-08-18" })).toBe("upcoming_deadline");
  });

  it("still warns on the day itself, rather than calling it late", () => {
    expect(deadlineEventFor({ dueDate: "2026-08-20", today: "2026-08-20" })).toBe("upcoming_deadline");
  });

  it("chases once the day has gone", () => {
    expect(deadlineEventFor({ dueDate: "2026-08-20", today: "2026-08-21" })).toBe("overdue_task");
  });
});

describe("deadlinePhrase", () => {
  it("reads naturally on each side of the date", () => {
    expect(deadlinePhrase({ dueDate: "2026-08-20", today: "2026-08-20" })).toBe("due today");
    expect(deadlinePhrase({ dueDate: "2026-08-20", today: "2026-08-19" })).toBe("due tomorrow");
    expect(deadlinePhrase({ dueDate: "2026-08-20", today: "2026-08-15" })).toBe("due in 5 days");
    expect(deadlinePhrase({ dueDate: "2026-08-20", today: "2026-08-21" })).toBe("1 day overdue");
    expect(deadlinePhrase({ dueDate: "2026-08-20", today: "2026-08-30" })).toBe("10 days overdue");
  });
});
