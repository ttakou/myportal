import { describe, expect, it } from "vitest";
import {
  actingHeading,
  actingSubject,
  resolveActingFor,
} from "@/lib/performance/acting-context";

const EMPLOYEE = "helen";
const MANAGER = { id: "huimin", name: "Huimin.Liu" };
const SECOND = { id: "ivo", name: "Ivo.Mesumbe" };

describe("resolveActingFor", () => {
  it("names the line manager the link came from", () => {
    expect(
      resolveActingFor({
        requested: "huimin",
        employeeId: EMPLOYEE,
        candidates: [MANAGER, SECOND],
      }),
    ).toEqual(MANAGER);
  });

  it("names a second-level reviewer just as readily", () => {
    expect(
      resolveActingFor({ requested: "ivo", employeeId: EMPLOYEE, candidates: [MANAGER, SECOND] })
        ?.name,
    ).toBe("Ivo.Mesumbe");
  });

  it("falls back when no one was asked for", () => {
    for (const requested of [null, undefined, "", "   "]) {
      expect(
        resolveActingFor({ requested, employeeId: EMPLOYEE, candidates: [MANAGER] }),
      ).toBeNull();
    }
  });

  it("refuses an id nobody on this appraisal answers to", () => {
    // The name goes in a heading, asserted by a query parameter. An arbitrary
    // id must not put words in the page's mouth.
    expect(
      resolveActingFor({ requested: "stranger", employeeId: EMPLOYEE, candidates: [MANAGER] }),
    ).toBeNull();
  });

  it("refuses the employee themselves", () => {
    // Standing in on somebody's own record is the default framing, not a role
    // you arrive holding.
    expect(
      resolveActingFor({
        requested: EMPLOYEE,
        employeeId: EMPLOYEE,
        candidates: [{ id: EMPLOYEE, name: "Helen.Arrey" }],
      }),
    ).toBeNull();
  });

  it("refuses a reviewer slot that is named but empty", () => {
    // The appraisal with no reviewer is exactly the case in play: there is
    // nobody to stand in for, and saying otherwise would be a lie.
    expect(
      resolveActingFor({
        requested: "huimin",
        employeeId: EMPLOYEE,
        candidates: [{ id: null, name: null }],
      }),
    ).toBeNull();
  });

  it("refuses a candidate whose name is unknown", () => {
    expect(
      resolveActingFor({
        requested: "huimin",
        employeeId: EMPLOYEE,
        candidates: [{ id: "huimin", name: null }],
      }),
    ).toBeNull();
  });
});

describe("actingHeading / actingSubject", () => {
  it("names the manager, and says whose appraisal it is", () => {
    expect(actingHeading(MANAGER, "Helen.Arrey")).toBe("Acting for Huimin.Liu");
    expect(actingSubject(MANAGER, "Helen.Arrey")).toBe("on Helen.Arrey's appraisal");
  });

  it("names the employee when standing in on their own record", () => {
    expect(actingHeading(null, "Helen.Arrey")).toBe("Acting for Helen.Arrey");
    expect(actingSubject(null, "Helen.Arrey")).toBeNull();
  });
});
