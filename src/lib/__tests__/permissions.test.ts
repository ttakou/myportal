import { describe, expect, it } from "vitest";
import { cleanPermissions, hasPermission, viewableSlugs, type PermissionMap } from "@/lib/permissions";

describe("hasPermission", () => {
  const perms: PermissionMap = { canteen: ["view", "create"], medical: ["view"] };

  it("is true only when the slug grants the verb", () => {
    expect(hasPermission(perms, "canteen", "create")).toBe(true);
    expect(hasPermission(perms, "canteen", "approve")).toBe(false);
  });

  it("is false for a slug the map doesn't mention", () => {
    expect(hasPermission(perms, "offshore", "view")).toBe(false);
  });
});

describe("cleanPermissions", () => {
  it("returns an empty map for null/undefined", () => {
    expect(cleanPermissions(null)).toEqual({});
    expect(cleanPermissions(undefined)).toEqual({});
  });

  it("drops modules that aren't in the capability matrix", () => {
    expect(cleanPermissions({ not_a_module: ["view"] })).toEqual({});
  });

  it("drops verbs that aren't valid for the module", () => {
    // canteen supports operate; "fly" is nonsense and must be stripped.
    expect(cleanPermissions({ canteen: ["view", "fly"] })).toEqual({ canteen: ["view"] });
  });

  it("drops a module whose only verbs are invalid for it", () => {
    // performance has no "operate" capability, so nothing valid remains.
    expect(cleanPermissions({ performance: ["operate"] })).toEqual({});
  });

  it("forces 'view' (first) when a module grants any other verb", () => {
    // You can't act on what you can't see.
    expect(cleanPermissions({ medical: ["create"] })).toEqual({ medical: ["view", "create"] });
  });

  it("de-duplicates verbs", () => {
    expect(cleanPermissions({ canteen: ["create", "view", "create"] })).toEqual({
      canteen: ["create", "view"],
    });
  });
});

describe("viewableSlugs", () => {
  it("returns only modules that grant view", () => {
    const map: PermissionMap = { canteen: ["view", "create"], savings: ["create"] };
    expect(viewableSlugs(map)).toEqual(["canteen"]);
  });

  it("is empty when nothing is viewable", () => {
    expect(viewableSlugs({})).toEqual([]);
  });
});
