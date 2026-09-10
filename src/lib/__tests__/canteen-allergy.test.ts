import { describe, expect, it } from "vitest";
import { allergenKey, allergyHits, parseAllergens } from "@/lib/canteen/allergy";

describe("allergies", () => {
  it("normalises case, accents, plurals and spacing", () => {
    expect(allergenKey("Peanuts")).toBe("peanut");
    expect(allergenKey("  Fruits à  coque ")).toBe("fruits a coque");
    expect(allergenKey("Œufs")).toBe("œuf");
  });

  it("tidies a typed list", () => {
    expect(parseAllergens("peanuts, Peanut; milk\n\n Milk ,")).toEqual(["peanuts", "milk"]);
    expect(parseAllergens(["Eggs", "eggs", ""])).toEqual(["Eggs"]);
  });

  it("finds the dish allergens that hit the person's list, either way round", () => {
    expect(allergyHits(["Peanuts", "Milk", "Wheat"], ["peanut", "gluten"])).toEqual(["Peanuts"]);
    expect(allergyHits(["Tree nuts (almond)"], ["tree nuts"])).toEqual(["Tree nuts (almond)"]);
    expect(allergyHits(["Fish"], ["Shellfish"])).toEqual(["Fish"]);
    expect(allergyHits(["Milk"], [])).toEqual([]);
    expect(allergyHits([], ["milk"])).toEqual([]);
  });
});
