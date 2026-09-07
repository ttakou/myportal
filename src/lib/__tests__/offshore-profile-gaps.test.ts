import { describe, expect, it } from "vitest";
import { gapsHeadline, offshoreProfileGaps } from "@/lib/offshore/profile-gaps";

const today = "2026-09-07";
const complete = {
  medical_expiry: "2027-01-01",
  bosiet_expiry: "2028-01-01",
  huet_expiry: "2028-01-01",
  emergency_contact: "Marie +237 6 00 00 00 00",
  back_to_back_id: "b2b",
  is_rotational: true,
};

describe("offshoreProfileGaps", () => {
  it("finds nothing to ask for on a complete profile", () => {
    expect(offshoreProfileGaps(complete, today)).toEqual([]);
  });

  it("lists every blank, in the order the form asks", () => {
    const gaps = offshoreProfileGaps(
      {
        medical_expiry: null,
        bosiet_expiry: null,
        huet_expiry: null,
        emergency_contact: null,
        back_to_back_id: null,
        is_rotational: true,
      },
      today,
    );
    expect(gaps.map((g) => g.key)).toEqual(["medical", "bosiet", "huet", "emergency_contact", "back_to_back"]);
    expect(gaps.every((g) => g.state === "missing")).toBe(true);
  });

  it("treats a past date as expired, with the date", () => {
    const gaps = offshoreProfileGaps({ ...complete, medical_expiry: "2026-08-01" }, today);
    expect(gaps).toEqual([
      expect.objectContaining({ key: "medical", state: "expired", date: "2026-08-01" }),
    ]);
  });

  it("does not ask a non-rotational person for a back-to-back", () => {
    const gaps = offshoreProfileGaps({ ...complete, back_to_back_id: null, is_rotational: false }, today);
    expect(gaps).toEqual([]);
  });

  it("treats a blank-space contact as missing", () => {
    const gaps = offshoreProfileGaps({ ...complete, emergency_contact: "   " }, today);
    expect(gaps.map((g) => g.key)).toEqual(["emergency_contact"]);
  });
});

describe("gapsHeadline", () => {
  it("counts expired and missing separately", () => {
    const gaps = offshoreProfileGaps(
      { ...complete, medical_expiry: "2026-01-01", emergency_contact: null, back_to_back_id: null },
      today,
    );
    expect(gapsHeadline(gaps)).toBe("1 certificate expired, 2 details missing");
  });
});
