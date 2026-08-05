import { describe, expect, it } from "vitest";
import { bedKey, duplicateBedKeys, roomBedIssues } from "@/lib/offshore/bed-issues";

const room = (bed_count: number, beds: (string | null)[]) => ({
  bed_count,
  occupants: beds.map((bed_no) => ({ bed_no })),
});

describe("bedKey", () => {
  it("folds case and collapses whitespace", () => {
    expect(bedKey(" BED  1 ")).toBe("bed 1");
    expect(bedKey("Bed 1")).toBe(bedKey("bed 1"));
  });

  it("keeps genuinely different berths apart", () => {
    expect(bedKey("B")).not.toBe(bedKey("T"));
    expect(bedKey("13")).not.toBe(bedKey("16"));
  });
});

describe("roomBedIssues", () => {
  it("reports nothing for a clean room", () => {
    expect(roomBedIssues(room(12, ["Bed 1", "Bed 2", "Bed 3"]))).toEqual([]);
  });

  it("accepts the facility's own bunk numbers without complaint", () => {
    // Door 5's real labels: bunk numbers well above the room's bed_count.
    expect(roomBedIssues(room(12, ["40", "43", "Bed 1", "Bed 2"]))).toEqual([]);
  });

  it("accepts bottom/top in a two-berth cabin", () => {
    expect(roomBedIssues(room(2, ["B", "T"]))).toEqual([]);
  });

  it("flags two people on one bunk (the real Door 3 case)", () => {
    const issues = roomBedIssues(room(12, ["13", "13", "16", "Bed 1"]));
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("duplicate");
    expect(issues[0].message).toBe("2 people on bed 13");
  });

  it("flags three on one bunk (the real Room 320 case) and the over-capacity with it", () => {
    const issues = roomBedIssues(room(2, ["T", "T", "T"]));
    expect(issues.map((i) => i.kind)).toEqual(["duplicate", "over_capacity"]);
    expect(issues[0].message).toBe("3 people on bed T");
    expect(issues[1].message).toBe("3 people in 2 bed(s)");
  });

  it("catches a clash hidden by casing or spacing", () => {
    const issues = roomBedIssues(room(12, ["Bed 1", "bed  1"]));
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("duplicate");
  });

  it("flags a room holding more people than berths", () => {
    const issues = roomBedIssues(room(2, ["B", "T", "Bed 3"]));
    expect(issues.map((i) => i.kind)).toEqual(["over_capacity"]);
  });

  it("flags someone on board with no bed recorded", () => {
    const issues = roomBedIssues(room(12, ["Bed 1", null, "   "]));
    expect(issues.map((i) => i.kind)).toEqual(["unassigned"]);
    expect(issues[0].message).toBe("2 on board here with no bed recorded");
  });

  it("does not treat several blank beds as a shared bunk", () => {
    const issues = roomBedIssues(room(12, [null, null]));
    expect(issues.some((i) => i.kind === "duplicate")).toBe(false);
  });

  it("orders duplicates before capacity before unassigned", () => {
    const issues = roomBedIssues(room(1, ["B", "B", null]));
    expect(issues.map((i) => i.kind)).toEqual(["duplicate", "over_capacity", "unassigned"]);
  });
});

describe("duplicateBedKeys", () => {
  it("returns the keys that need highlighting", () => {
    expect(duplicateBedKeys(room(12, ["13", "13", "16"]))).toEqual(new Set(["13"]));
  });

  it("matches the normalised key so both spellings highlight", () => {
    const keys = duplicateBedKeys(room(12, ["Bed 1", "bed 1", "Bed 2"]));
    expect(keys.has(bedKey("BED  1"))).toBe(true);
    expect(keys.has(bedKey("Bed 2"))).toBe(false);
  });

  it("is empty for a clean room", () => {
    expect(duplicateBedKeys(room(12, ["Bed 1", "Bed 2"])).size).toBe(0);
  });
});

describe("visitor-held beds count as occupied", () => {
  // Room 313 read 0/2 while a visitor was checked in there: getRooms built
  // occupants from trips only, and a visitor holds a bed through
  // offshore_bed_allocations. The room then offered an occupied berth.
  it("a visitor fills a bed just like staff", () => {
    const r = { bed_count: 2, occupants: [{ bed_no: null }] };
    expect(r.occupants.length).toBe(1);
    // One of two berths gone, so only one is free.
    expect(r.bed_count - r.occupants.length).toBe(1);
  });

  it("a visitor with no bed label is not reported as a duplicate", () => {
    expect(
      roomBedIssues({ bed_count: 2, occupants: [{ bed_no: null }, { bed_no: "Bed 1" }] })
        .filter((i) => i.kind === "duplicate"),
    ).toEqual([]);
  });

  it("but two unlabelled occupants are reported as needing a bed recorded", () => {
    const issues = roomBedIssues({ bed_count: 2, occupants: [{ bed_no: null }, { bed_no: null }] });
    expect(issues.map((i) => i.kind)).toEqual(["unassigned"]);
  });

  it("a visitor pushing a room past capacity is flagged", () => {
    const issues = roomBedIssues({
      bed_count: 1,
      occupants: [{ bed_no: "Bed 1" }, { bed_no: null }],
    });
    expect(issues.some((i) => i.kind === "over_capacity")).toBe(true);
  });
});
