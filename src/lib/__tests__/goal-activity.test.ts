import { describe, expect, it } from "vitest";
import { byGoal, unlinked, type GoalActivity } from "@/lib/performance/goal-activity";

const at = (id: string, goalId: string | null): GoalActivity => ({
  id,
  goalId,
  title: null,
  body: `body ${id}`,
  authorName: "Alex Takou",
  createdAt: `2026-06-0${id}T09:00:00Z`,
});

describe("byGoal", () => {
  it("gathers each goal's updates under it", () => {
    const map = byGoal([at("1", "g1"), at("2", "g2"), at("3", "g1")]);
    expect(map.get("g1")?.map((u) => u.id)).toEqual(["1", "3"]);
    expect(map.get("g2")?.map((u) => u.id)).toEqual(["2"]);
  });

  it("keeps the order it was given, which is newest first", () => {
    const map = byGoal([at("3", "g1"), at("1", "g1")]);
    expect(map.get("g1")?.map((u) => u.id)).toEqual(["3", "1"]);
  });

  it("leaves out updates tied to no goal", () => {
    // They belong on the page, but not under a goal — putting them under an
    // arbitrary one would attribute work to the wrong objective.
    const map = byGoal([at("1", null), at("2", "g1")]);
    expect(map.has("g1")).toBe(true);
    expect([...map.values()].flat().map((u) => u.id)).toEqual(["2"]);
  });

  it("is empty for no updates", () => {
    expect(byGoal([]).size).toBe(0);
  });
});

describe("unlinked", () => {
  it("keeps only what names no goal", () => {
    // Every update posted before the goal picker existed is one of these, and
    // they are still the record of what somebody did.
    expect(unlinked([at("1", null), at("2", "g1"), at("3", null)]).map((u) => u.id)).toEqual([
      "1",
      "3",
    ]);
  });

  it("is empty when everything is linked", () => {
    expect(unlinked([at("1", "g1")])).toEqual([]);
  });
});
