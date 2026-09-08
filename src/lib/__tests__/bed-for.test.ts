import { describe, expect, it } from "vitest";
import { bedFor, bedLabel } from "@/lib/offshore/bed-for";

const base = { onBoard: false, tripRoom: null, tripBed: null, fixedRoom: "Room 308", fixedBed: "1" };

describe("bedFor", () => {
  it("shows the trip's bed while on board", () => {
    expect(bedFor({ ...base, onBoard: true, tripRoom: "Room 308", tripBed: "1" })).toEqual({
      source: "trip",
      label: "Room 308 · Bed 1",
      differsFromDefault: null,
    });
  });

  it("says when the bed in use is not the default", () => {
    // A late arrival put wherever there was room.
    expect(bedFor({ ...base, onBoard: true, tripRoom: "Room 214", tripBed: "2" })).toEqual({
      source: "trip",
      label: "Room 214 · Bed 2",
      differsFromDefault: "Room 308 · Bed 1",
    });
  });

  it("falls back to the default when onshore", () => {
    expect(bedFor(base)).toEqual({ source: "default", label: "Room 308 · Bed 1", differsFromDefault: null });
  });

  it("falls back to the default when on board with no bed on the trip", () => {
    expect(bedFor({ ...base, onBoard: true })).toEqual({
      source: "default",
      label: "Room 308 · Bed 1",
      differsFromDefault: null,
    });
  });

  it("copes with a room but no bed number", () => {
    expect(bedFor({ ...base, fixedBed: null }).label).toBe("Room 308");
  });

  it("has nothing when nothing is assigned", () => {
    expect(bedFor({ onBoard: false, tripRoom: null, tripBed: null, fixedRoom: null, fixedBed: null })).toEqual({
      source: "none",
      label: null,
      differsFromDefault: null,
    });
  });
});

describe("bedLabel", () => {
  it("keeps a stored 'Bed 1' as it is and prefixes a bare number or bunk letter", () => {
    expect(bedLabel("Bed 1")).toBe("Bed 1");
    expect(bedLabel("bed 3")).toBe("bed 3");
    expect(bedLabel("1")).toBe("Bed 1");
    expect(bedLabel("T")).toBe("Bed T");
    expect(bedLabel(" ")).toBeNull();
    expect(bedLabel(null)).toBeNull();
  });

  it("never reads 'Bed Bed 1'", () => {
    expect(bedFor({ onBoard: false, tripRoom: null, tripBed: null, fixedRoom: "Room 220", fixedBed: "Bed 1" }).label).toBe(
      "Room 220 · Bed 1",
    );
  });
});
