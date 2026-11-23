import { describe, expect, it } from "vitest";
import { buildMonthlyReport, daysOfMonth, tripAboardOn, visitAboardOn, UNKNOWN_COMPANY, type ReportTrip, type ReportVisit } from "@/lib/offshore/monthly-report";

const J = "juliet";
const trip = (person: string, company: string | null, status: string, mob: string, demob: string | null, crew: string | null = null): ReportTrip => ({
  person, company, crew_id: crew, installation_id: null, status, mobilize_date: mob, demob_date: demob,
});
const visit = (person: string, company: string | null, status: string, dep: string, ret: string | null): ReportVisit => ({
  person, company, installation_id: J, status, depart_date: dep, return_date: ret,
});

describe("days of a month", () => {
  it("lists the month, stopping at today", () => {
    expect(daysOfMonth("2026-02").length).toBe(28);
    expect(daysOfMonth("2026-11", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});

describe("who was on board on a day (the meal sheet's rule)", () => {
  it("counts a trip from arrival to the day before it left; still aboard counts every day", () => {
    const t = trip("A", null, "demobilised", "2026-11-03", "2026-11-05");
    expect(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((d) => tripAboardOn(t, d))).toEqual([false, true, true, false]);
    expect(tripAboardOn(trip("B", null, "onboard", "2026-11-03", "2026-11-04"), "2026-11-20")).toBe(true);
    expect(tripAboardOn(trip("C", null, "cancelled", "2026-11-03", null), "2026-11-04")).toBe(false);
  });

  it("counts a visit up to its return; a day visit counts its day", () => {
    expect(visitAboardOn(visit("V", null, "onboard", "2026-11-03", "2026-11-03"), "2026-11-03")).toBe(true);
    expect(visitAboardOn(visit("V", null, "returned", "2026-11-03", "2026-11-05"), "2026-11-05")).toBe(false);
    expect(visitAboardOn(visit("V", null, "approved", "2026-11-03", "2026-11-05"), "2026-11-04")).toBe(false);
  });
});

describe("the monthly report", () => {
  const CYCLE = { offshore_days: 21, onshore_days: 21, cycle_start_date: "2026-10-01" }; // offshore 10-01→10-22, 11-12→12-03
  const report = buildMonthlyReport({
    month: "2026-11",
    today: "2026-11-05",
    trips: [
      trip("Ann", "ICC", "demobilised", "2026-10-25", "2026-11-03"), // aboard 1, 2 Nov
      trip("Bob", "SIPN", "onboard", "2026-11-02", null), // aboard 2–5 Nov
      trip("Cid", null, "onboard", "2026-10-01", null, "crew"), // crew ashore since 22 Oct: overstaying
    ],
    visits: [visit("Vic", "ETHOS", "onboard", "2026-11-04", "2026-11-04")],
    installations: [{ id: J, name: "Juliet", capacity: 3 }],
    defaultInstallationId: J,
    cycles: new Map([["crew", CYCLE]]),
    meals: [
      { meal_date: "2026-11-02", person_name: "Ann", category: "staff", breakfast: true, snack: false, lunch: true, dinner: true, lodging: true },
      { meal_date: "2026-11-02", person_name: "Zed", category: "casual", breakfast: false, snack: false, lunch: true, dinner: false, lodging: false },
      { meal_date: "2026-10-31", person_name: "Ann", category: "staff", breakfast: true, snack: true, lunch: true, dinner: true, lodging: true },
    ],
    companyByName: new Map([["ann", "ICC"]]),
  });

  it("counts POB per day, only up to today", () => {
    expect(report.days.map((d) => d.total)).toEqual([2, 3, 2, 3, 2]);
  });

  it("finds the peak, the average and the days over capacity", () => {
    expect(report.totals).toMatchObject({ manDays: 12, peak: 3, peakDate: "2026-11-02", average: 2.4, people: 4 });
    expect(report.installations[0]).toMatchObject({ peak: 3, daysOverCapacity: 0, lowest: 2 });
  });

  it("adds up man-days and meals per company", () => {
    const by = Object.fromEntries(report.companies.map((c) => [c.company, c]));
    expect(by.ICC).toMatchObject({ manDays: 2, people: 1 });
    expect(by.ICC.meals).toEqual({ breakfast: 1, snack: 0, lunch: 1, dinner: 1, lodging: 1 }); // October not counted
    expect(by.SIPN.manDays).toBe(4);
    expect(by.ETHOS.manDays).toBe(1);
    expect(by[UNKNOWN_COMPANY].manDays).toBe(5); // Cid, no company
    expect(by[UNKNOWN_COMPANY].meals.lunch).toBe(1); // Zed, a casual diner not on any roster
  });

  it("lists overstayers by the crew rotation, with the days overstayed this month", () => {
    expect(report.overstayers).toEqual([{ person: "Cid", company: null, days: 5, from: "2026-11-01", to: "2026-11-05" }]);
  });
});
