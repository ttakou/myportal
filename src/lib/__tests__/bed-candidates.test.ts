import { describe, expect, it } from "vitest";
import { bedCandidates, type AshorePerson, type BedPoolPerson } from "@/lib/offshore/bed-candidates";

const DOOR5 = "room-door5";
const DOOR3 = "room-door3";

// Shaped after the real Door 5 case that surfaced the bug: OUM is already an
// occupant of Door 5 and still has to be selectable for Door 5's empty beds.
const pool: BedPoolPerson[] = [
  { id: "t-oum", room_id: DOOR5, name: "OUM RAPHAEL", placedIn: "Door 5", bed: "43" },
  { id: "t-mandeng", room_id: DOOR5, name: "MANDENG MARTIAL", placedIn: "Door 5", bed: "Bed 1" },
  { id: "t-nkodo", room_id: DOOR3, name: "Nkodo Mebara", placedIn: "Door 3", bed: "Bed 2" },
  { id: "t-waiting", room_id: null, name: "Bella Joseph", placedIn: null, bed: null },
];

describe("bedCandidates", () => {
  it("offers an occupant of this very room, as a bed change", () => {
    const list = bedCandidates(pool, DOOR5);
    const oum = list.find((c) => c.id === "t-oum");
    expect(oum).toBeDefined();
    expect(oum!.label).toBe("OUM RAPHAEL — change bed (now 43)");
  });

  it("marks on-board people as a move, not a boarding", () => {
    for (const c of bedCandidates(pool, DOOR5)) expect(c.kind).toBe("move");
  });

  it("never drops anyone from the list", () => {
    expect(bedCandidates(pool, DOOR5).map((c) => c.id).sort()).toEqual(
      pool.map((p) => p.id).sort(),
    );
  });

  it("describes someone in another room as a move", () => {
    const nkodo = bedCandidates(pool, DOOR5).find((c) => c.id === "t-nkodo");
    expect(nkodo!.label).toBe("Nkodo Mebara — move from Door 3");
  });

  it("shows a bed-less person by name alone and marks them waiting", () => {
    const bella = bedCandidates(pool, DOOR5).find((c) => c.id === "t-waiting");
    expect(bella!.label).toBe("Bella Joseph");
    expect(bella!.waiting).toBe(true);
  });

  it("sorts people waiting for a bed to the top", () => {
    expect(bedCandidates(pool, DOOR5)[0].id).toBe("t-waiting");
  });

  it("omits the bed hint when the occupant has no bed label", () => {
    const noBed: BedPoolPerson[] = [
      { id: "t-x", room_id: DOOR5, name: "No Bed", placedIn: "Door 5", bed: null },
    ];
    expect(bedCandidates(noBed, DOOR5)[0].label).toBe("No Bed — change bed");
  });

  it("re-labels the same person as the room changes", () => {
    // Viewed from Door 3, OUM is a move; from Door 5, a bed change.
    expect(bedCandidates(pool, DOOR3).find((c) => c.id === "t-oum")!.label).toBe(
      "OUM RAPHAEL — move from Door 5",
    );
  });
});

describe("bedCandidates — ashore staff", () => {
  const ashore: AshorePerson[] = [
    { profile_id: "p-ash", name: "Ashore Alice", crew_name: "CREW A" },
    { profile_id: "p-ash2", name: "Ashore Bob", crew_name: null },
  ];

  it("leaves ashore staff out unless boarding is allowed", () => {
    const list = bedCandidates(pool, DOOR5, ashore, false);
    expect(list.some((c) => c.kind === "board")).toBe(false);
    expect(list).toHaveLength(pool.length);
  });

  it("offers them when boarding is allowed, keyed by profile id", () => {
    const list = bedCandidates(pool, DOOR5, ashore, true);
    const alice = list.find((c) => c.id === "p-ash");
    expect(alice).toBeDefined();
    expect(alice!.kind).toBe("board");
  });

  it("says in the label that picking them boards them", () => {
    const alice = bedCandidates(pool, DOOR5, ashore, true).find((c) => c.id === "p-ash")!;
    expect(alice.label).toBe("Ashore Alice · CREW A — ashore, board into this bed");
  });

  it("omits the crew when there is none", () => {
    const bob = bedCandidates(pool, DOOR5, ashore, true).find((c) => c.id === "p-ash2")!;
    expect(bob.label).toBe("Ashore Bob — ashore, board into this bed");
  });

  it("sorts ashore staff after everyone already on board", () => {
    const list = bedCandidates(pool, DOOR5, ashore, true);
    const firstBoard = list.findIndex((c) => c.kind === "board");
    const lastMove = list.map((c) => c.kind).lastIndexOf("move");
    expect(firstBoard).toBeGreaterThan(lastMove);
  });

  it("still puts a bed-less on-board person at the very top", () => {
    expect(bedCandidates(pool, DOOR5, ashore, true)[0].id).toBe("t-waiting");
  });
});
