import { describe, expect, it } from "vitest";
import { compareRooms, roomLabel, sortRooms } from "@/lib/offshore/room-order";

const r = (room_number: string, block: string | null = null) => ({ block, room_number });

describe("roomLabel", () => {
  it("joins block and number", () => {
    expect(roomLabel(r("204", "A"))).toBe("A 204");
  });

  it("falls back to the number alone when there is no block", () => {
    expect(roomLabel(r("Door 5"))).toBe("Door 5");
  });
});

describe("compareRooms / sortRooms", () => {
  it("orders numbers naturally, not as text", () => {
    // The whole point: a plain string sort puts "Door 10" before "Door 3".
    const sorted = sortRooms([r("Door 10"), r("Door 3"), r("Door 2"), r("Door 1")]);
    expect(sorted.map(roomLabel)).toEqual(["Door 1", "Door 2", "Door 3", "Door 10"]);
  });

  it("sorts the real estate labels A→Z", () => {
    const sorted = sortRooms([
      r("Room 332"), r("Door 5"), r("Echo"), r("Room 204"), r("Door 12"), r("Door 3"),
    ]);
    expect(sorted.map(roomLabel)).toEqual([
      "Door 3", "Door 5", "Door 12", "Echo", "Room 204", "Room 332",
    ]);
  });

  it("ignores case so one room cannot land in two places", () => {
    expect(compareRooms(r("door 5"), r("Door 5"))).toBe(0);
  });

  it("orders by block first when blocks differ", () => {
    const sorted = sortRooms([r("1", "B"), r("9", "A"), r("2", "A")]);
    expect(sorted.map(roomLabel)).toEqual(["A 2", "A 9", "B 1"]);
  });

  it("does not mutate the input", () => {
    const input = [r("Door 9"), r("Door 1")];
    const copy = [...input];
    sortRooms(input);
    expect(input).toEqual(copy);
  });

  it("is a stable, total order (sorting twice changes nothing)", () => {
    const once = sortRooms([r("Echo"), r("Door 7"), r("Room 205"), r("Door 70")]);
    expect(sortRooms(once).map(roomLabel)).toEqual(once.map(roomLabel));
  });
});
