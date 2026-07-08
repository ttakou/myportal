import { describe, expect, it } from "vitest";
import { isEffectiveOn } from "@/types/versioning";

describe("isEffectiveOn", () => {
  const base = { status: "published" as const, effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };

  it("is effective inside the window", () => {
    expect(isEffectiveOn(base, "2026-06-15")).toBe(true);
    expect(isEffectiveOn(base, "2026-01-01")).toBe(true);
    expect(isEffectiveOn(base, "2026-12-31")).toBe(true);
  });
  it("is not effective outside the window", () => {
    expect(isEffectiveOn(base, "2025-12-31")).toBe(false);
    expect(isEffectiveOn(base, "2027-01-01")).toBe(false);
  });
  it("treats open-ended bounds as unbounded", () => {
    expect(isEffectiveOn({ status: "published", effectiveFrom: null, effectiveTo: null }, "2030-01-01")).toBe(true);
    expect(isEffectiveOn({ status: "published", effectiveFrom: "2026-01-01", effectiveTo: null }, "2999-01-01")).toBe(true);
  });
  it("only published versions are ever effective", () => {
    expect(isEffectiveOn({ status: "draft", effectiveFrom: null, effectiveTo: null }, "2026-06-01")).toBe(false);
    expect(isEffectiveOn({ status: "archived", effectiveFrom: null, effectiveTo: null }, "2026-06-01")).toBe(false);
  });
});
