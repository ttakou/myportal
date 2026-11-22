import { describe, expect, it } from "vitest";
import { aboardOn, syncMealSheet, type SheetTrip, type SheetVisit } from "@/lib/offshore/meal-sheet";

const J = "juliet";
const trip = (name: string, status: string, mob: string, demob: string | null, inst: string | null = null): SheetTrip => ({
  name, status, mobilize_date: mob, demob_date: demob, installation_id: inst,
});
const visit = (name: string, status: string, dep: string, ret: string | null, inst: string | null = J): SheetVisit => ({
  name, status, depart_date: dep, return_date: ret, installation_id: inst,
});

describe("who is on a day's meal sheet", () => {
  it("follows POB: on board from arrival, gone once demobilised", () => {
    const names = aboardOn("2026-11-22", J, [
      trip("Arrived today", "onboard", "2026-11-22", "2026-12-13"),
      trip("Overdue but aboard", "onboard", "2026-10-01", "2026-11-20"),
      trip("Left today", "demobilised", "2026-11-03", "2026-11-22"),
      trip("Not yet", "onboard", "2026-11-23", null),
      trip("Other rig", "onboard", "2026-11-01", null, "rig"),
      trip("Juliet", "onboard", "2026-11-01", null, J),
    ], []).map((p) => p.name);
    expect(names).toEqual(["Arrived today", "Overdue but aboard", "Juliet"]);
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
      { name: "Day visit", category: "visitor" },
      { name: "Back tomorrow", category: "visitor" },
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
    expect(res).toEqual({ add: [{ name: "New", category: "staff" }], removeIds: ["2"] });
  });
});
