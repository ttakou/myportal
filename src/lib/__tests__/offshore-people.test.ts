import { describe, expect, it } from "vitest";
import {
  offshorePeople,
  type DirectoryPerson,
  type RosterInfo,
} from "@/lib/offshore/people";

const directory: DirectoryPerson[] = [
  { id: "r1", name: "Rostered Rita", crew_id: "A", crew_name: "CREW A" },
  { id: "c1", name: "Contractor Carl", crew_id: null, crew_name: null },
  { id: "b1", name: "Barred Bob", crew_id: "A", crew_name: "CREW A" },
];

const roster: RosterInfo[] = [
  { profile_id: "r1", name: "Rostered Rita", crew_id: "A", crew_name: "CREW A", company: "APCC", travel_eligible: true },
  { profile_id: "b1", name: "Barred Bob", crew_id: "A", crew_name: "CREW A", travel_eligible: false },
  { profile_id: "z9", name: "Inactive Zed", crew_id: "B", crew_name: "CREW B", travel_eligible: true },
];

describe("offshorePeople", () => {
  it("includes people with no roster row at all", () => {
    // The whole point: Derick Mamubah and the 50 like him were unreachable.
    const ids = offshorePeople(directory, roster).map((p) => p.profile_id);
    expect(ids).toContain("c1");
  });

  it("marks who is rostered and who is not", () => {
    const out = offshorePeople(directory, roster);
    expect(out.find((p) => p.profile_id === "r1")!.rostered).toBe(true);
    expect(out.find((p) => p.profile_id === "c1")!.rostered).toBe(false);
  });

  it("drops only people explicitly barred from travelling", () => {
    const ids = offshorePeople(directory, roster).map((p) => p.profile_id);
    expect(ids).not.toContain("b1");
    expect(ids).toContain("c1"); // no roster row is NOT a bar
  });

  it("keeps a rostered person the directory did not return", () => {
    // Deactivated but still on board — they must remain demobilisable.
    const ids = offshorePeople(directory, roster).map((p) => p.profile_id);
    expect(ids).toContain("z9");
  });

  it("appends the company from the roster", () => {
    const rita = offshorePeople(directory, roster).find((p) => p.profile_id === "r1")!;
    expect(rita.name).toBe("Rostered Rita · APCC");
  });

  it("leaves the name alone when there is no company", () => {
    expect(offshorePeople(directory, roster).find((p) => p.profile_id === "c1")!.name).toBe(
      "Contractor Carl",
    );
  });

  it("takes the crew from the roster when it has one", () => {
    const rita = offshorePeople(directory, roster).find((p) => p.profile_id === "r1")!;
    expect(rita.crew_name).toBe("CREW A");
  });

  it("leaves an unrostered person crewless", () => {
    const carl = offshorePeople(directory, roster).find((p) => p.profile_id === "c1")!;
    expect(carl.crew_id).toBeNull();
  });

  it("never lists anyone twice", () => {
    const ids = offshorePeople(directory, roster).map((p) => p.profile_id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("sorts by name", () => {
    const names = offshorePeople(directory, roster).map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("works from a directory alone", () => {
    expect(offshorePeople(directory, []).map((p) => p.profile_id)).toEqual(["b1", "c1", "r1"]);
  });

  it("works from a roster alone", () => {
    expect(offshorePeople([], roster).map((p) => p.profile_id).sort()).toEqual(["r1", "z9"]);
  });
});
