import { describe, expect, it } from "vitest";
import { bedCandidates, type BedPoolPerson } from "@/lib/offshore/bed-candidates";

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
