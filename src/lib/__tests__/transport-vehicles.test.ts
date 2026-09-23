import { describe, expect, it } from "vitest";
import { parseAssignee, parseFuel, poolFirst, vehicleLabel } from "@/lib/transport/vehicles";

describe("vehicle label", () => {
  it("names the vehicle, its plate and who it is assigned to", () => {
    expect(vehicleLabel({ name: "Toyota Prado", plate: "CE.303.MS", assigned_to: "Operations Manager" })).toBe(
      "Toyota Prado · CE.303.MS (Operations Manager)",
    );
    expect(vehicleLabel({ name: "Toyota Hiace", plate: "LT.175.LP", assigned_to: null })).toBe("Toyota Hiace · LT.175.LP");
    expect(vehicleLabel({ name: "Coaster", plate: null, assigned_to: null })).toBe("Coaster");
  });
});

describe("pool first", () => {
  it("puts pool vehicles ahead of assigned ones, by name then plate", () => {
    const out = poolFirst([
      { name: "Toyota Prado", plate: "CE.303.MS", assigned_to: "Operations Manager" },
      { name: "Toyota Hilux", plate: "LT.979.KT", assigned_to: null },
      { name: "Toyota Hiace", plate: "LT.175.LP", assigned_to: null },
      { name: "Toyota Hilux", plate: "LT.978.KT", assigned_to: null },
      { name: "Suzuki Vitara", plate: "LT.862.KB", assigned_to: "Completion Engineer" },
    ]);
    expect(out.map((v) => v.plate)).toEqual(["LT.175.LP", "LT.978.KT", "LT.979.KT", "LT.862.KB", "CE.303.MS"]);
  });
});

describe("parsing", () => {
  it("normalises fuel and treats petrol as gasoline", () => {
    expect(parseFuel("Diesel")).toBe("diesel");
    expect(parseFuel(" gasoline ")).toBe("gasoline");
    expect(parseFuel("Petrol")).toBe("gasoline");
    expect(parseFuel("")).toBeNull();
    expect(parseFuel("nuclear")).toBeNull();
  });

  it("turns an empty or 'Pool' assignee into the pool", () => {
    expect(parseAssignee("  Operations   Manager ")).toBe("Operations Manager");
    expect(parseAssignee("Pool")).toBeNull();
    expect(parseAssignee("")).toBeNull();
    expect(parseAssignee(undefined)).toBeNull();
  });
});
