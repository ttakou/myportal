import { describe, expect, it } from "vitest";
import {
  canCapability,
  cleanMatrix,
  resolvePermRoles,
  DEFAULT_PERMISSION_MATRIX,
  PERM_CAPABILITIES,
  PERM_ROLES,
  type RoleResolverAccess,
} from "@/types/perf-permissions";

const baseAccess: RoleResolverAccess = {
  isAdmin: false,
  isSystemAdmin: false,
  isHr: false,
};

describe("default permission matrix", () => {
  it("keeps the employee to form + comments only — no scores or recommendations", () => {
    const e = DEFAULT_PERMISSION_MATRIX.employee;
    expect(e.form_view).toBe(true);
    expect(e.comments_view).toBe(true);
    expect(e.scores_view).toBe(false);
    expect(e.promotion_view).toBe(false);
  });

  it("gives admins every capability", () => {
    for (const cap of PERM_CAPABILITIES) {
      expect(DEFAULT_PERMISSION_MATRIX.system_admin[cap]).toBe(true);
      expect(DEFAULT_PERMISSION_MATRIX.hr_admin[cap]).toBe(true);
    }
  });
});

describe("canCapability", () => {
  it("is the OR across the roles a user holds", () => {
    // employee can't see scores, line_manager can → holding both grants it.
    expect(canCapability(DEFAULT_PERMISSION_MATRIX, ["employee"], "scores_view")).toBe(false);
    expect(
      canCapability(DEFAULT_PERMISSION_MATRIX, ["employee", "line_manager"], "scores_view"),
    ).toBe(true);
  });

  it("returns false when the user holds no roles", () => {
    expect(canCapability(DEFAULT_PERMISSION_MATRIX, [], "form_view")).toBe(false);
  });
});

describe("resolvePermRoles", () => {
  it("maps self / manager / second-level relationships", () => {
    expect(resolvePermRoles(baseAccess, { isSelf: true })).toEqual(["employee"]);
    expect(resolvePermRoles(baseAccess, { isDirectManager: true })).toEqual(["line_manager"]);
    expect(resolvePermRoles(baseAccess, { isSecondLevel: true })).toEqual(["second_level"]);
  });

  it("adds hr_admin / system_admin from access flags", () => {
    expect(resolvePermRoles({ ...baseAccess, isHr: true }, {})).toContain("hr_admin");
    expect(resolvePermRoles({ ...baseAccess, isSystemAdmin: true }, {})).toContain("system_admin");
  });
});

describe("cleanMatrix", () => {
  it("fills missing entries from defaults and drops unknown keys", () => {
    const m = cleanMatrix({ employee: { scores_view: true, bogus_cap: true }, ghost_role: {} });
    expect(m.employee.scores_view).toBe(true); // overridden value kept
    expect(m.employee.form_view).toBe(true); // filled from default
    expect((m.employee as Record<string, unknown>).bogus_cap).toBeUndefined();
    expect((m as Record<string, unknown>).ghost_role).toBeUndefined();
    // shape is total
    for (const role of PERM_ROLES) {
      for (const cap of PERM_CAPABILITIES) {
        expect(typeof m[role][cap]).toBe("boolean");
      }
    }
  });
});
