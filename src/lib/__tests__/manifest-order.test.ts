import { describe, expect, it } from "vitest";
import { manifestWorkOrder } from "@/lib/offshore/manifest-order";

describe("manifest work order", () => {
  it("puts today's first, then the coming days soonest first, then past days still open", () => {
    const list = [
      { id: "far", scheduled_date: "2026-12-08", direction: "out" },
      { id: "past", scheduled_date: "2026-11-20", direction: "out" },
      { id: "today-in", scheduled_date: "2026-11-23", direction: "in" },
      { id: "soon", scheduled_date: "2026-11-24", direction: "out" },
      { id: "today-out", scheduled_date: "2026-11-23", direction: "out" },
      { id: "older", scheduled_date: "2026-11-10", direction: "in" },
    ];
    expect(manifestWorkOrder(list, "2026-11-23").map((m) => m.id)).toEqual(["today-out", "today-in", "soon", "far", "past", "older"]);
  });
});
