import { describe, expect, it } from "vitest";
import { renderTemplate, resolveRuleProfileIds } from "@/lib/notify-template";

describe("renderTemplate", () => {
  it("substitutes whitespace-tolerant placeholders", () => {
    expect(renderTemplate("Hi {{employee}} — {{cycle }} starts", { employee: "Sam", cycle: "2026" })).toBe(
      "Hi Sam — 2026 starts",
    );
  });
  it("drops unknown tokens and handles empty input", () => {
    expect(renderTemplate("{{missing}}!", {})).toBe("!");
    expect(renderTemplate(null)).toBe("");
  });
});

describe("resolveRuleProfileIds", () => {
  const ctx = {
    tenantId: "t",
    employeeIds: ["e1", "e2"],
    managerIds: ["m1"],
    secondLevelIds: ["s1"],
  };
  it("maps roles to ids and dedupes", () => {
    expect(resolveRuleProfileIds(["employee", "line_manager"], ctx).sort()).toEqual(["e1", "e2", "m1"]);
  });
  it("ignores roles with no ids in context", () => {
    expect(resolveRuleProfileIds(["hr", "calibration"], ctx)).toEqual([]);
  });
});
