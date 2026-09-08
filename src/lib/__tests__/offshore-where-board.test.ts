import { describe, expect, it } from "vitest";
import {
  boardSummary,
  filterRows,
  groupRows,
  isException,
  type BoardRow,
} from "@/lib/offshore/where-board";

const row = (over: Partial<BoardRow> & { id: string; name: string }): BoardRow => ({
  crew: "CREW H",
  lifeboat: "LB-1",
  bed: "Room 308 · Bed 1",
  bedSource: "default",
  installation: "Juliet",
  onBoard: false,
  kind: "onshore",
  nextChange: "2026-09-12",
  daysToChange: 5,
  isRotational: true,
  ...over,
});

const rows: BoardRow[] = [
  row({ id: "1", name: "Henry", kind: "onshore" }),
  row({ id: "2", name: "Alain", kind: "offshore", onBoard: true, bedSource: "trip", crew: "CREW E", lifeboat: null }),
  row({ id: "3", name: "Marie", kind: "due_offshore", crew: "CREW E", bed: "Room 214 · Bed 2" }),
  row({ id: "4", name: "Paul", kind: "overdue_off", onBoard: true, lifeboat: "LB-2" }),
  row({ id: "5", name: "Zoe", kind: "no_schedule", crew: null, bed: null, isRotational: false }),
];

describe("boardSummary", () => {
  it("counts the schedule's offshore, the record's on board, and each disagreement", () => {
    expect(boardSummary(rows)).toEqual({
      total: 5,
      scheduledOffshore: 2,
      onBoard: 2,
      dueOffshore: 1,
      overdueOff: 1,
      offEarly: 0,
      noSchedule: 1,
      onBoardNoLifeboat: 1,
    });
  });
});

describe("groupRows", () => {
  it("groups by muster station with the unassigned last, names sorted", () => {
    const g = groupRows(rows, "lifeboat");
    expect(g.map((x) => x.key)).toEqual(["LB-1", "LB-2", "Not assigned"]);
    expect(g[0].rows.map((r) => r.name)).toEqual(["Henry", "Marie", "Zoe"]);
    expect(g[1].onBoard).toBe(1);
  });

  it("groups by cabin on the room, not the bed", () => {
    const g = groupRows(rows, "cabin");
    expect(g.map((x) => x.key)).toEqual(["Room 214", "Room 308", "Not assigned"]);
    expect(g[1].rows).toHaveLength(3);
  });

  it("sorts group keys numerically so LB-10 follows LB-9", () => {
    const g = groupRows(
      [row({ id: "a", name: "A", lifeboat: "LB-10" }), row({ id: "b", name: "B", lifeboat: "LB-9" })],
      "lifeboat",
    );
    expect(g.map((x) => x.key)).toEqual(["LB-9", "LB-10"]);
  });

  it("groups by crew", () => {
    expect(groupRows(rows, "crew").map((x) => x.key)).toEqual(["CREW E", "CREW H", "Not assigned"]);
  });
});

describe("filterRows", () => {
  it("narrows to on board or to the exceptions", () => {
    expect(filterRows(rows, "onboard").map((r) => r.name)).toEqual(["Alain", "Paul"]);
    expect(filterRows(rows, "exceptions").map((r) => r.name)).toEqual(["Marie", "Paul"]);
    expect(filterRows(rows, "all")).toHaveLength(5);
  });

  it("knows which kinds are exceptions", () => {
    expect(isException("overdue_off")).toBe(true);
    expect(isException("offshore")).toBe(false);
    expect(isException("no_schedule")).toBe(false);
  });
});
