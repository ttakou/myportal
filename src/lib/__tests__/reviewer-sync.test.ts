import { describe, expect, it } from "vitest";
import {
  offerProfileSync,
  reportingLineHint,
  reportingLineState,
  reviewerDefaults,
} from "@/lib/performance/reviewer-sync";

describe("reviewerDefaults", () => {
  it("keeps the appraisal's reviewer when it has one", () => {
    expect(reviewerDefaults({ appraisalManagerId: "huimin", profileManagerId: "ivo" })).toEqual({
      initialManagerId: "huimin",
      suggestedFromProfile: false,
    });
  });

  it("borrows the profile's manager when the appraisal names nobody", () => {
    // The common fault: over a hundred appraisals launched with no reviewer
    // while the profiles knew the answer all along.
    expect(reviewerDefaults({ appraisalManagerId: null, profileManagerId: "huimin" })).toEqual({
      initialManagerId: "huimin",
      suggestedFromProfile: true,
    });
  });

  it("starts empty when neither names anybody", () => {
    expect(reviewerDefaults({ appraisalManagerId: null, profileManagerId: null })).toEqual({
      initialManagerId: "",
      suggestedFromProfile: false,
    });
  });
});

describe("reportingLineState", () => {
  it("is unset with nobody chosen", () => {
    expect(reportingLineState({ chosenManagerId: "", profileManagerId: "huimin" })).toBe("unset");
  });

  it("is the same when the profile already agrees", () => {
    expect(reportingLineState({ chosenManagerId: "huimin", profileManagerId: "huimin" })).toBe(
      "same",
    );
  });

  it("differs when the profile names somebody else", () => {
    expect(reportingLineState({ chosenManagerId: "huimin", profileManagerId: "ivo" })).toBe(
      "differs",
    );
  });

  it("notes an empty profile", () => {
    expect(reportingLineState({ chosenManagerId: "huimin", profileManagerId: null })).toBe(
      "profile_empty",
    );
  });
});

describe("offerProfileSync", () => {
  it("offers the sync only when it would change something", () => {
    expect(offerProfileSync("differs")).toBe(true);
    expect(offerProfileSync("profile_empty")).toBe(true);
    expect(offerProfileSync("same")).toBe(false);
    expect(offerProfileSync("unset")).toBe(false);
  });
});

describe("reportingLineHint", () => {
  const helen = { employeeName: "Helen.Arrey" };

  it("says the two agree", () => {
    expect(
      reportingLineHint({ ...helen, state: "same", profileManagerName: "Huimin.Liu" }),
    ).toBe("Also Helen.Arrey's line manager on their profile.");
  });

  it("names who the profile has instead", () => {
    expect(
      reportingLineHint({ ...helen, state: "differs", profileManagerName: "Ivo.Mesumbe" }),
    ).toBe("Helen.Arrey's profile names Ivo.Mesumbe as line manager.");
  });

  it("says when the profile is empty", () => {
    expect(reportingLineHint({ ...helen, state: "profile_empty", profileManagerName: null })).toBe(
      "Helen.Arrey's profile names no line manager.",
    );
  });

  it("still describes the profile before anyone is chosen", () => {
    expect(
      reportingLineHint({ ...helen, state: "unset", profileManagerName: "Huimin.Liu" }),
    ).toBe("Helen.Arrey's profile names Huimin.Liu as line manager.");
    expect(reportingLineHint({ ...helen, state: "unset", profileManagerName: null })).toBe(
      "Helen.Arrey's profile names no line manager.",
    );
  });
});
