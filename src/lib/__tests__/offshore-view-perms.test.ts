import { describe, expect, it } from "vitest";
import {
  OFFSHORE_VIEW_KEYS,
  canSeeOffshoreManagement,
  firstOffshoreManagementView,
  offshoreHubSubmenu,
  offshoreViewPerm,
  type OffshoreRoleFlags,
} from "@/app/(portal)/offshore/_components/offshore-views";

const MANAGER: OffshoreRoleFlags = { manager: true, dispatcher: false, registrar: false };
const DISPATCHER: OffshoreRoleFlags = { manager: false, dispatcher: true, registrar: false };
const REGISTRAR: OffshoreRoleFlags = { manager: false, dispatcher: false, registrar: true };
const NOBODY: OffshoreRoleFlags = { manager: false, dispatcher: false, registrar: false };

describe("offshoreViewPerm — registrar", () => {
  it("grants the registrar exactly one view", () => {
    const full = OFFSHORE_VIEW_KEYS.filter((k) => offshoreViewPerm(k, REGISTRAR) !== "none");
    expect(full).toEqual(["register"]);
  });

  it("keeps POB, crews, manifests and accommodation hidden from a registrar", () => {
    for (const k of ["dashboard", "board", "crews", "manifests", "rooms", "bedboard", "roster"] as const) {
      expect(offshoreViewPerm(k, REGISTRAR)).toBe("none");
    }
  });

  it("lets a manager and a dispatcher register too", () => {
    expect(offshoreViewPerm("register", MANAGER)).toBe("full");
    expect(offshoreViewPerm("register", DISPATCHER)).toBe("full");
  });

  it("gives someone with no offshore role nothing at all", () => {
    for (const k of OFFSHORE_VIEW_KEYS) expect(offshoreViewPerm(k, NOBODY)).toBe("none");
    expect(canSeeOffshoreManagement(NOBODY)).toBe(false);
  });

  it("does not narrow a manager who also holds the create verb", () => {
    // Holding the access role as well as the role must never cost them access.
    const both: OffshoreRoleFlags = { manager: true, dispatcher: false, registrar: true };
    for (const k of OFFSHORE_VIEW_KEYS) expect(offshoreViewPerm(k, both)).toBe("full");
  });

  it("does not narrow a dispatcher who also holds the create verb", () => {
    const both: OffshoreRoleFlags = { manager: false, dispatcher: true, registrar: true };
    expect(offshoreViewPerm("crews", both)).toBe("full");
    expect(offshoreViewPerm("rooms", both)).toBe("view");
  });
});

describe("management entry points", () => {
  it("admits a registrar to the management area", () => {
    expect(canSeeOffshoreManagement(REGISTRAR)).toBe(true);
  });

  it("lands a registrar on the register view", () => {
    expect(firstOffshoreManagementView(REGISTRAR)).toBe("register");
  });

  it("shows a registrar a single sidebar hub pointing at that view", () => {
    const items = offshoreHubSubmenu(REGISTRAR);
    // "My trips" is the self-service hub everyone gets; the only management hub
    // is Offshore Staff, trimmed to its register tab.
    const management = items.filter((i) => i.key !== "mytrips");
    expect(management).toHaveLength(1);
    expect(management[0].key).toBe("register");
    expect(management[0].href).toBe("/offshore?view=register");
  });

  it("still gives a manager every hub", () => {
    const items = offshoreHubSubmenu(MANAGER);
    expect(items.length).toBeGreaterThan(5);
    expect(items.some((i) => i.key === "dashboard")).toBe(true);
  });
});
