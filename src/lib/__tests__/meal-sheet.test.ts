import { describe, expect, it } from "vitest";
import { aboardOn, isCaterer, sheetGroup, sheetOrder, startingMeals, syncMealSheet, type SheetTrip, type SheetVisit } from "@/lib/offshore/meal-sheet";

const J = "juliet";
const trip = (name: string, status: string, mob: string, demob: string | null, inst: string | null = null): SheetTrip => ({
  name, status, mobilize_date: mob, demob_date: demob, installation_id: inst,
});
const visit = (name: string, status: string, dep: string, ret: string | null, inst: string | null = J): SheetVisit => ({
  name, status, depart_date: dep, return_date: ret, installation_id: inst,
});

describe("who is on a day's meal sheet", () => {
  it("follows POB, with that day's arrivals and leavers marked", () => {
    const list = aboardOn("2026-11-22", J, [
      trip("Arrived today", "onboard", "2026-11-22", "2026-12-13"),
      trip("Overdue but aboard", "onboard", "2026-10-01", "2026-11-22"),
      trip("Left today", "demobilised", "2026-11-03", "2026-11-22"),
      trip("Left yesterday", "demobilised", "2026-11-01", "2026-11-21"),
      trip("Not yet", "onboard", "2026-11-23", null),
      trip("Other rig", "onboard", "2026-11-01", null, "rig"),
      trip("Juliet", "onboard", "2026-11-01", null, J),
    ], []);
    expect(list.map((p) => [p.name, p.movement])).toEqual([
      ["Arrived today", "arrival"],
      // Still marked on board past their date: staying, not leaving.
      ["Overdue but aboard", null],
      ["Left today", "departure"],
      ["Juliet", null],
    ]);
  });

  it("rebuilds a past day with the people who have left since", () => {
    const names = aboardOn("2026-11-20", J, [trip("Left on the 22nd", "demobilised", "2026-11-03", "2026-11-22")], []).map((p) => p.name);
    expect(names).toEqual(["Left on the 22nd"]);
  });

  it("counts visitors for their stay", () => {
    const list = aboardOn("2026-11-22", J, [], [
      visit("Day visit", "approved", "2026-11-22", "2026-11-22"),
      visit("Back yesterday", "returned", "2026-11-18", "2026-11-21"),
      visit("Back tomorrow", "returned", "2026-11-18", "2026-11-23"),
    ]);
    expect(list).toEqual([
      { name: "Day visit", category: "visitor", movement: "day" },
      { name: "Back tomorrow", category: "visitor", movement: null },
    ]);
  });
});

describe("bringing a saved sheet in line with POB", () => {
  it("adds newcomers, drops leavers, keeps casual diners and everyone else's ticks", () => {
    const res = syncMealSheet(
      [
        { id: "1", person_name: "Stays", category: "staff" },
        { id: "2", person_name: "Left", category: "staff" },
        { id: "3", person_name: "Casual", category: "casual" },
      ],
      [{ name: "Stays", category: "staff" }, { name: "New", category: "staff" }],
    );
    expect(res).toEqual({ add: [{ name: "New", category: "staff" }], removeIds: ["2"], toCaterer: [], remark: [] });
  });

  it("re-marks someone whose day changed: a postponed leaver is staying again", () => {
    const res = syncMealSheet(
      [
        { id: "1", person_name: "Was leaving", category: "staff", movement: "departure" },
        { id: "2", person_name: "Made ahead", category: "staff", movement: null },
        { id: "3", person_name: "Unchanged", category: "staff", movement: "arrival" },
      ],
      [
        { name: "Was leaving", category: "staff", movement: null },
        { name: "Made ahead", category: "staff", movement: "departure" },
        { name: "Unchanged", category: "staff", movement: "arrival" },
      ],
    );
    expect(res.remark).toEqual([
      { id: "1", category: "staff", movement: null },
      { id: "2", category: "staff", movement: "departure" },
    ]);
  });
});

describe("crew-change day ticks", () => {
  it("arrivals: snack, lunch, dinner and a bed; leavers: breakfast, snack and lunch", () => {
    expect(startingMeals("staff", "arrival")).toEqual({ breakfast: false, snack: true, lunch: true, dinner: true, lodging: true });
    expect(startingMeals("staff", "departure")).toEqual({ breakfast: true, snack: true, lunch: true, dinner: false, lodging: false });
    expect(startingMeals("visitor", "day")).toEqual({ breakfast: false, snack: true, lunch: true, dinner: false, lodging: false });
    expect(startingMeals("staff")).toEqual({ breakfast: true, snack: true, lunch: true, dinner: true, lodging: true });
    expect(startingMeals("caterer", "arrival").lunch).toBe(false);
  });

  it("lists arrivals, then leavers, then everyone staying, the caterer's staff last", () => {
    const order = sheetOrder([
      { category: "staff", person_name: "Aaron", movement: null },
      { category: "caterer", person_name: "Cook", movement: "arrival" },
      { category: "staff", person_name: "Zed", movement: "departure" },
      { category: "visitor", person_name: "Yan", movement: "arrival" },
      { category: "staff", person_name: "Xavier", movement: "arrival" },
    ]).map((r) => r.person_name);
    expect(order).toEqual(["Xavier", "Yan", "Zed", "Aaron", "Cook"]);
    expect(sheetGroup({ category: "caterer", movement: "arrival" })).toBe("caterer");
  });
});

describe("the caterer's own staff", () => {
  it("recognises Pellegrini, however it is spelt", () => {
    expect(isCaterer("PELLEGRINI")).toBe(true);
    expect(isCaterer("Pelligrini")).toBe(true);
    expect(isCaterer("TEFON")).toBe(false);
    expect(isCaterer(null)).toBe(false);
  });

  it("puts them on the sheet as caterers, with no meal ticked, last", () => {
    const people = aboardOn("2026-11-23", J, [
      { ...trip("Cook", "onboard", "2026-11-10", null), company: "PELLEGRINI" },
      trip("Operator", "onboard", "2026-11-10", null),
    ], []);
    expect(people).toEqual([
      { name: "Cook", category: "caterer", movement: null },
      { name: "Operator", category: "staff", movement: null },
    ]);
    expect(startingMeals("caterer")).toEqual({ breakfast: false, snack: false, lunch: false, dinner: false, lodging: false });
    expect(startingMeals("staff").lunch).toBe(true);
    const order = sheetOrder([
      { category: "caterer", person_name: "Aaron" },
      { category: "casual", person_name: "Guest" },
      { category: "staff", person_name: "Zed" },
      { category: "visitor", person_name: "Auditor" },
    ]).map((r) => r.person_name);
    expect(order).toEqual(["Zed", "Auditor", "Guest", "Aaron"]);
  });

  it("moves a caterer saved earlier as staff into their group", () => {
    const res = syncMealSheet([{ id: "9", person_name: "Cook", category: "staff" }], [{ name: "Cook", category: "caterer" }]);
    expect(res).toEqual({ add: [], removeIds: [], toCaterer: ["9"], remark: [] });
  });
});
