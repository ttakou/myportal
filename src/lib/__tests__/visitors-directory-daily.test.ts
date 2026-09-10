import { describe, expect, it } from "vitest";
import { directoryKey, matchDirectory, ordinal, phoneKey } from "@/lib/visitors/directory";
import { expectedOn, isAfterHours, neverCame, overstays, parseClock, siteClock, siteDate } from "@/lib/visitors/daily";

describe("visitor directory", () => {
  const people = [
    { id: "a", full_name: "Jean Mbarga", company: "Total", id_document_number: "CM-123 456", phone: "+237 699 00 11 22" },
    { id: "b", full_name: "Jean Mbarga", company: "Perenco", id_document_number: null, phone: null },
    { id: "c", full_name: "Aïcha Ndongo", company: null, id_document_number: null, phone: "677889900" },
  ];

  it("keys on the ID number, else name and company", () => {
    expect(directoryKey({ full_name: "x", id_document_number: "cm123456" })).toBe("id:cm123456");
    expect(directoryKey({ full_name: " Jean  MBARGA ", company: "Total" })).toBe("name:jean mbarga|total");
  });

  it("matches on the ID number first, ignoring spaces, dashes and case", () => {
    expect(matchDirectory({ full_name: "Someone Else", id_document_number: "cm123456" }, people)?.id).toBe("a");
  });

  it("then on the phone, digits only, with or without the country code", () => {
    expect(matchDirectory({ full_name: "A. Ndongo", phone: "+237 677 88 99 00" }, people)?.id).toBe("c");
    expect(phoneKey("+237 699 00 11 22")).toBe("699001122");
  });

  it("then on name and company, and refuses to guess between namesakes", () => {
    expect(matchDirectory({ full_name: "jean mbarga", company: "PERENCO" }, people)?.id).toBe("b");
    expect(matchDirectory({ full_name: "Jean Mbarga", company: "Shell" }, people)).toBeNull();
    expect(matchDirectory({ full_name: "Nobody" }, people)).toBeNull();
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  });
});

describe("site clock", () => {
  it("renders on the Douala clock and parses HH:MM", () => {
    expect(siteClock("2026-09-10T05:30:00Z")).toBe("06:30");
    expect(siteClock(null)).toBe("—");
    expect(siteDate("2026-09-10T23:30:00Z")).toBe("2026-09-11");
    expect(parseClock("18:30")).toBe(1110);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("")).toBeNull();
  });

  it("flags after-hours entries with a window that wraps midnight", () => {
    expect(isAfterHours("2026-09-10T18:30:00Z", "18:00", "06:00")).toBe(true); // 19:30 local
    expect(isAfterHours("2026-09-10T09:00:00Z", "18:00", "06:00")).toBe(false); // 10:00 local
    expect(isAfterHours("2026-09-10T04:00:00Z", "18:00", "06:00")).toBe(true); // 05:00 local
    expect(isAfterHours("2026-09-10T09:00:00Z", "", "06:00")).toBe(false);
  });
});

describe("daily job", () => {
  const visits = [
    { id: "today", status: "pre_registered", visit_date: "2026-09-10", visit_until: null },
    { id: "tomorrow", status: "pre_registered", visit_date: "2026-09-11", visit_until: null },
    { id: "pass", status: "pre_registered", visit_date: "2026-09-08", visit_until: "2026-09-12" },
    { id: "old", status: "pre_registered", visit_date: "2026-09-09", visit_until: null },
    { id: "oldpass", status: "pre_registered", visit_date: "2026-09-01", visit_until: "2026-09-09" },
    { id: "came", status: "checked_out", visit_date: "2026-09-09", visit_until: null },
  ];

  it("lists who is expected on a date, passes included", () => {
    expect(expectedOn(visits, "2026-09-11").map((v) => v.id)).toEqual(["tomorrow", "pass"]);
  });

  it("finds the visits that never came once their window has passed", () => {
    expect(neverCame(visits, "2026-09-10").map((v) => v.id)).toEqual(["old", "oldpass"]);
  });

  it("flags overstays after the cutoff, once a day, not for late arrivals", () => {
    const now = "2026-09-10T19:30:00Z"; // 20:30 local
    const onSite = [
      { id: "morning", check_in_at: "2026-09-10T08:00:00Z", overstay_alerted_at: null },
      { id: "told", check_in_at: "2026-09-10T08:00:00Z", overstay_alerted_at: "2026-09-10T19:05:00Z" },
      { id: "toldyesterday", check_in_at: "2026-09-09T08:00:00Z", overstay_alerted_at: "2026-09-09T19:05:00Z" },
      { id: "nightcall", check_in_at: "2026-09-10T19:20:00Z", overstay_alerted_at: null },
    ];
    expect(overstays(onSite, now, "20:00").map((v) => v.id)).toEqual(["morning", "toldyesterday"]);
    expect(overstays(onSite, "2026-09-10T17:00:00Z", "20:00")).toEqual([]);
    expect(overstays(onSite, now, "")).toEqual([]);
  });
});
