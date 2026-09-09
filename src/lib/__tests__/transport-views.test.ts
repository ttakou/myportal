import { describe, expect, it } from "vitest";
import {
  defaultTransportView,
  resolveTransportView,
  transportSubmenu,
  transportViewAllowed,
  type TransportFlags,
} from "@/app/(portal)/transportation/_components/transport-views";

const EMPLOYEE: TransportFlags = { admin: false, driver: false, canCreate: true, outOfTown: true };
const VIEWER: TransportFlags = { admin: false, driver: false, canCreate: false, outOfTown: false };
const DRIVER: TransportFlags = { admin: false, driver: true, canCreate: false, outOfTown: false };
const ADMIN: TransportFlags = { admin: true, driver: false, canCreate: true, outOfTown: true };

describe("transportViewAllowed", () => {
  it("gives everyone the requests list", () => {
    expect(transportViewAllowed("requests", VIEWER)).toBe(true);
  });

  it("lets only request-makers raise one, only admins dispatch, only drivers drive", () => {
    expect(transportViewAllowed("new", EMPLOYEE)).toBe(true);
    expect(transportViewAllowed("new", VIEWER)).toBe(false);
    expect(transportViewAllowed("new", ADMIN)).toBe(true);
    expect(transportViewAllowed("dispatch", EMPLOYEE)).toBe(false);
    expect(transportViewAllowed("dispatch", ADMIN)).toBe(true);
    expect(transportViewAllowed("driver", DRIVER)).toBe(true);
    expect(transportViewAllowed("driver", EMPLOYEE)).toBe(false);
  });
});

describe("resolveTransportView", () => {
  it("lands a driver on their tasks and everyone else on the requests", () => {
    expect(defaultTransportView(DRIVER)).toBe("driver");
    expect(defaultTransportView(EMPLOYEE)).toBe("requests");
    expect(defaultTransportView({ ...ADMIN, driver: true })).toBe("requests");
  });

  it("keeps a permitted deep link and falls back otherwise", () => {
    expect(resolveTransportView("dispatch", ADMIN)).toBe("dispatch");
    expect(resolveTransportView("dispatch", EMPLOYEE)).toBe("requests");
    expect(resolveTransportView("nonsense", DRIVER)).toBe("driver");
    expect(resolveTransportView(undefined, EMPLOYEE)).toBe("requests");
  });
});

describe("transportSubmenu", () => {
  it("lists the permitted views in order, then Out of Town Trip when enabled", () => {
    expect(transportSubmenu(EMPLOYEE).map((i) => i.key)).toEqual(["requests", "new", "out-of-town"]);
    expect(transportSubmenu(ADMIN).map((i) => i.key)).toEqual(["requests", "new", "dispatch", "out-of-town"]);
    expect(transportSubmenu(DRIVER).map((i) => i.key)).toEqual(["requests", "driver"]);
  });

  it("links each view through ?view= and Out of Town Trip to its own route", () => {
    const items = transportSubmenu(ADMIN);
    expect(items.find((i) => i.key === "dispatch")?.href).toBe("/transportation?view=dispatch");
    expect(items.find((i) => i.key === "out-of-town")?.href).toBe("/out-of-town");
  });
});
