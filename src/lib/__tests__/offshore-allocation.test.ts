import { describe, expect, it } from "vitest";
import { planBedAllocation, type AllocPerson, type AllocRoom } from "@/lib/offshore/allocation";

const person = (id: string, over: Partial<AllocPerson> = {}): AllocPerson => ({
  id,
  profile_id: `p-${id}`,
  crew_id: null,
  room_id: null,
  bed_no: null,
  ...over,
});

const room = (id: string, beds: number, over: Partial<AllocRoom> = {}): AllocRoom => ({
  id,
  bed_count: beds,
  gender_restriction: "any",
  status: "available",
  ...over,
});

const plan = (input: Partial<Parameters<typeof planBedAllocation>[0]>) =>
  planBedAllocation({
    onboard: [],
    rooms: [],
    visitorAllocations: [],
    fixedByProfile: new Map(),
    ...input,
  });

describe("planBedAllocation", () => {
  it("does nothing when everyone already has a bed", () => {
    expect(
      plan({ onboard: [person("t1", { room_id: "r1", bed_no: "Bed 1" })], rooms: [room("r1", 2)] }),
    ).toEqual({ assignments: [], unplaced: 0 });
  });

  it("honours a fixed cabin first, using the fixed bed label when free", () => {
    const res = plan({
      onboard: [person("t1")],
      rooms: [room("r1", 2), room("r2", 4)],
      fixedByProfile: new Map([["p-t1", { room_id: "r1", bed: "Bed 2" }]]),
    });
    expect(res.assignments).toEqual([{ id: "t1", room_id: "r1", bed_no: "Bed 2" }]);
  });

  it("falls back to open rooms when the fixed cabin is full", () => {
    const res = plan({
      onboard: [
        person("t0", { room_id: "r1", bed_no: "Bed 1" }),
        person("t1"),
      ],
      rooms: [room("r1", 1), room("r2", 2)],
      fixedByProfile: new Map([["p-t1", { room_id: "r1", bed: "Bed 1" }]]),
    });
    expect(res.assignments).toEqual([{ id: "t1", room_id: "r2", bed_no: "Bed 1" }]);
  });

  it("never auto-fills gender-restricted, blocked or maintenance rooms", () => {
    const res = plan({
      onboard: [person("t1")],
      rooms: [
        room("female", 4, { gender_restriction: "female" }),
        room("blocked", 4, { status: "blocked" }),
        room("maint", 4, { status: "maintenance" }),
      ],
    });
    expect(res.assignments).toEqual([]);
    expect(res.unplaced).toBe(1);
  });

  it("keeps crewmates together, filling one room before opening the next", () => {
    const res = plan({
      onboard: [
        person("a1", { crew_id: "A" }),
        person("b1", { crew_id: "B" }),
        person("a2", { crew_id: "A" }),
      ],
      rooms: [room("r1", 2), room("r2", 2)],
    });
    const roomOf = Object.fromEntries(res.assignments.map((a) => [a.id, a.room_id]));
    expect(roomOf.a1).toBe(roomOf.a2); // crew A shares a room
    expect(roomOf.b1).not.toBe(roomOf.a1); // crew B starts the next room
    expect(res.unplaced).toBe(0);
  });

  it("auto-numbers beds, skipping labels already taken", () => {
    const res = plan({
      onboard: [person("t0", { room_id: "r1", bed_no: "Bed 1" }), person("t1"), person("t2")],
      rooms: [room("r1", 3)],
    });
    expect(res.assignments.map((a) => a.bed_no).sort()).toEqual(["Bed 2", "Bed 3"]);
  });

  it("counts visitor bed allocations toward a room's occupancy", () => {
    const res = plan({
      onboard: [person("t1"), person("t2")],
      rooms: [room("r1", 2)],
      visitorAllocations: ["r1"],
    });
    expect(res.assignments).toHaveLength(1); // only one bed left after the visitor
    expect(res.unplaced).toBe(1);
  });

  it("reports the people it cannot seat", () => {
    const res = plan({
      onboard: [person("t1"), person("t2"), person("t3")],
      rooms: [room("r1", 2)],
    });
    expect(res.assignments).toHaveLength(2);
    expect(res.unplaced).toBe(1);
  });
});
