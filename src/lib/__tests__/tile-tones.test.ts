import { describe, expect, it } from "vitest";
import { emptyRoomsTone, freeBedsTone, noRoomTone, pobTone } from "@/lib/offshore/tile-tones";

describe("Overview tile colours", () => {
  it("colours POB: green under 120, amber 120–150, red over 150", () => {
    expect(pobTone(119)).toBe("green");
    expect(pobTone(120)).toBe("amber");
    expect(pobTone(146)).toBe("amber");
    expect(pobTone(150)).toBe("amber");
    expect(pobTone(151)).toBe("red");
  });

  it("colours free beds outside Echo: red under 5, amber 5–12, green over 12", () => {
    expect(freeBedsTone(4)).toBe("red");
    expect(freeBedsTone(5)).toBe("amber");
    expect(freeBedsTone(11)).toBe("amber");
    expect(freeBedsTone(12)).toBe("amber");
    expect(freeBedsTone(13)).toBe("green");
  });

  it("colours empty rooms: red at 0, amber at 1, green from 2", () => {
    expect(emptyRoomsTone(0)).toBe("red");
    expect(emptyRoomsTone(1)).toBe("amber");
    expect(emptyRoomsTone(2)).toBe("green");
  });

  it("colours on board with no room: red if anyone, green if nobody", () => {
    expect(noRoomTone(0)).toBe("green");
    expect(noRoomTone(3)).toBe("red");
  });
});
