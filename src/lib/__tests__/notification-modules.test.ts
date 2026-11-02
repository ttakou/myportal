import { describe, expect, it } from "vitest";
import { emailAllowed, moduleFor, notifyAllowed, urlSegment, type ModuleStates } from "@/lib/notification-modules";
import { MODULE_PARAMS, withDefaults } from "@/lib/module-params";

const states: ModuleStates = new Map([
  ["savings", { slug: "savings", active: false, email: true }],
  ["visitors", { slug: "visitors", active: true, email: false }],
  ["transportation", { slug: "transportation", active: true, email: true }],
  ["offshore", { slug: "offshore", active: true, email: true }],
]);

describe("which module a notification belongs to", () => {
  it("reads the first segment of the link", () => {
    expect(urlSegment("/savings?view=forecast")).toBe("savings");
    expect(urlSegment("/out-of-town/abc")).toBe("out-of-town");
    expect(urlSegment("/offshore#cert-1")).toBe("offshore");
    expect(urlSegment("https://example.com/x")).toBeNull();
    expect(urlSegment(null)).toBeNull();
  });

  it("prefers the module named over the link", () => {
    expect(moduleFor(states, "/dashboard", "offshore")?.slug).toBe("offshore");
    expect(moduleFor(states, "/dashboard")).toBeNull();
    expect(moduleFor(states, "/savings")?.slug).toBe("savings");
    expect(moduleFor(undefined, "/savings")).toBeNull();
  });
});

describe("what may still go out", () => {
  it("holds back everything from a switched-off module", () => {
    const m = moduleFor(states, "/savings?view=admin");
    expect(notifyAllowed(m)).toBe(false);
    expect(emailAllowed(m)).toBe(false);
  });

  it("keeps the bell but not email when the email switch is off", () => {
    const m = moduleFor(states, "/visitors");
    expect(notifyAllowed(m)).toBe(true);
    expect(emailAllowed(m)).toBe(false);
  });

  it("never holds back what belongs to no module", () => {
    expect(notifyAllowed(null)).toBe(true);
    expect(emailAllowed(null)).toBe(true);
    expect(emailAllowed(moduleFor(states, "/transportation"))).toBe(true);
  });

  it("gives every notifying module an email switch, on by default, but not Emergency", () => {
    expect(MODULE_PARAMS.performance.some((d) => d.key === "email_notifications")).toBe(true);
    expect(MODULE_PARAMS.visitors[0].key).toBe("email_notifications");
    expect((MODULE_PARAMS.emergency ?? []).some((d) => d.key === "email_notifications")).toBe(false);
    expect(withDefaults("savings", {}).email_notifications).toBe(true);
  });
});
