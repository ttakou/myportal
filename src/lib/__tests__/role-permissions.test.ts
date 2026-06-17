import { describe, expect, it } from "vitest";
import { canAssignAccountRole, canAssignFunctionalRole } from "@/lib/role-permissions";

const sysAdmin = { isSystemAdmin: true, isHr: true };
const hrOnly = { isSystemAdmin: false, isHr: true };
const plainUser = { isSystemAdmin: false, isHr: false };

describe("canAssignFunctionalRole", () => {
  it("lets system admins grant any functional role", () => {
    expect(canAssignFunctionalRole(sysAdmin, "system_admin")).toBe(true);
    expect(canAssignFunctionalRole(sysAdmin, "hr_admin")).toBe(true);
    expect(canAssignFunctionalRole(sysAdmin, "finance")).toBe(true);
  });

  it("blocks HR from granting privileged roles (no self-escalation to admin)", () => {
    expect(canAssignFunctionalRole(hrOnly, "system_admin")).toBe(false);
    expect(canAssignFunctionalRole(hrOnly, "hr_admin")).toBe(false);
  });

  it("still lets HR grant non-privileged functional roles", () => {
    expect(canAssignFunctionalRole(hrOnly, "finance")).toBe(true);
    expect(canAssignFunctionalRole(hrOnly, "canteen_manager")).toBe(true);
    expect(canAssignFunctionalRole(hrOnly, "safety_admin")).toBe(true);
  });

  it("blocks users without HR/admin capability entirely", () => {
    expect(canAssignFunctionalRole(plainUser, "finance")).toBe(false);
    expect(canAssignFunctionalRole(plainUser, "system_admin")).toBe(false);
  });
});

describe("canAssignAccountRole", () => {
  it("restricts admin-equivalent account roles to system admins", () => {
    expect(canAssignAccountRole(hrOnly, "tenant_admin")).toBe(false);
    expect(canAssignAccountRole(hrOnly, "super_admin")).toBe(false);
    expect(canAssignAccountRole(sysAdmin, "tenant_admin")).toBe(true);
  });

  it("allows ordinary account roles for HR", () => {
    expect(canAssignAccountRole(hrOnly, "employee")).toBe(true);
    expect(canAssignAccountRole(hrOnly, "manager")).toBe(true);
  });
});
