import { describe, expect, it } from "vitest";
import {
  OFFSHORE_VIEW_KEYS,
  type OffshoreRoleFlags,
} from "@/app/(portal)/offshore/_components/offshore-views";
import {
  VIEW_DATA,
  effectiveManagementView,
  managementDataFor,
} from "@/app/(portal)/offshore/_components/offshore-view-data";

const MANAGER: OffshoreRoleFlags = { manager: true, dispatcher: false, registrar: false };
const DISPATCHER: OffshoreRoleFlags = { manager: false, dispatcher: true, registrar: false };
const REGISTRAR: OffshoreRoleFlags = { manager: false, dispatcher: false, registrar: true };

describe("VIEW_DATA", () => {
  it("names every view, so a new view cannot silently load nothing", () => {
    for (const key of OFFSHORE_VIEW_KEYS) expect(VIEW_DATA).toHaveProperty(key);
  });

  it("loads nothing for the views that fetch their own data", () => {
    expect(managementDataFor("mytrips").size).toBe(0);
    expect(managementDataFor("whereis").size).toBe(0);
    expect(managementDataFor("history").size).toBe(0);
    expect(managementDataFor("catering").size).toBe(0);
  });

  it("gives each view what its panel takes", () => {
    // The dashboard is the only view that needs the POB and accommodation
    // summaries together; Installations needs only its own list.
    expect(managementDataFor("dashboard").has("pob")).toBe(true);
    expect(managementDataFor("dashboard").has("accommodation")).toBe(true);
    expect([...managementDataFor("installations")]).toEqual(["manageInstallations"]);
    expect(managementDataFor("installations").has("pob")).toBe(false);
    expect([...managementDataFor("drill")].sort()).toEqual(
      ["emergencyTeams", "musterDrill", "musterDrillHistory"].sort(),
    );
  });
});

describe("effectiveManagementView", () => {
  it("lands an unknown or self-service value on the dashboard", () => {
    expect(effectiveManagementView(undefined, MANAGER)).toBe("dashboard");
    expect(effectiveManagementView("mytrips", MANAGER)).toBe("dashboard");
    expect(effectiveManagementView("nonsense", MANAGER)).toBe("dashboard");
  });

  it("keeps a permitted deep link", () => {
    expect(effectiveManagementView("manifests", DISPATCHER)).toBe("manifests");
  });

  it("falls back to the first permitted view when the role may not open the link", () => {
    // A Dispatcher hitting ?view=catering sees the dashboard instead, and the
    // page must load dashboard data, not catering's (which is none).
    expect(effectiveManagementView("catering", DISPATCHER)).toBe("dashboard");
    expect(effectiveManagementView("dashboard", REGISTRAR)).toBe("register");
  });
});
