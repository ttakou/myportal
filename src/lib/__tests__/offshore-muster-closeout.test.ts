import { describe, expect, it } from "vitest";
import {
  describeCloseOut,
  mmss,
  musterHeadline,
  musterSummary,
  type CloseoutCheckin,
} from "@/lib/offshore/muster-closeout";

const started = "2026-09-07T10:00:00Z";
const c = (
  name: string,
  lifeboat: string | null,
  outcome: CloseoutCheckin["outcome"],
  at: string | null = null,
): CloseoutCheckin => ({ id: name, name, lifeboat, outcome, accounted_at: at });

describe("musterSummary", () => {
  it("counts each outcome and the open rest, per lifeboat", () => {
    const s = musterSummary(
      [
        c("A", "LB-1", "accounted", "2026-09-07T10:02:00Z"),
        c("B", "LB-1", "no_show"),
        c("C", "LB-2", "not_on_board"),
        c("D", "LB-2", null),
        c("E", null, "accounted", "2026-09-07T10:03:30Z"),
      ],
      started,
    );
    expect(s).toMatchObject({ total: 5, accounted: 2, noShow: 1, notOnBoard: 1, open: 1, expected: 4 });
    expect(s.allClearAt).toBeNull();
    expect(s.byLifeboat.map((g) => g.lifeboat)).toEqual(["LB-1", "LB-2", "Unassigned"]);
    expect(s.byLifeboat[0]).toMatchObject({ total: 2, accounted: 1, noShow: 1 });
  });

  it("is all clear only when everybody expected is accounted, timed from the last tick", () => {
    const s = musterSummary(
      [
        c("A", "LB-1", "accounted", "2026-09-07T10:02:00Z"),
        c("B", "LB-1", "accounted", "2026-09-07T10:03:42Z"),
        // Never on board: not expected at the station, does not block all clear.
        c("C", "LB-2", "not_on_board"),
      ],
      started,
    );
    expect(s.allClearAt).toBe("2026-09-07T10:03:42Z");
    expect(s.secondsToAllClear).toBe(222);
    expect(musterHeadline(s)).toBe("All 2 accounted · all clear in 3:42");
  });

  it("never reaches all clear with a no-show", () => {
    const s = musterSummary(
      [c("A", "LB-1", "accounted", "2026-09-07T10:02:00Z"), c("B", "LB-1", "no_show")],
      started,
    );
    expect(s.allClearAt).toBeNull();
    expect(musterHeadline(s)).toBe("1 of 2 accounted · 1 no-show");
  });

  it("says what is still open", () => {
    const s = musterSummary([c("A", "LB-1", "accounted"), c("B", "LB-1", null)], started);
    expect(musterHeadline(s)).toBe("1 of 2 accounted · 1 still open");
  });
});

describe("describeCloseOut", () => {
  it("says what the open rest will become and the final tally", () => {
    const s = musterSummary(
      [c("A", "LB-1", "accounted"), c("B", "LB-1", null), c("C", "LB-1", null), c("D", "LB-2", "not_on_board")],
      started,
    );
    const t = describeCloseOut(s, "no_show");
    expect(t.consequence).toContain("2 people still open will be recorded as no-show");
    expect(t.consequence).toContain("1 accounted, 2 no-show, 1 not on board");
    expect(describeCloseOut(s, "not_on_board").consequence).toContain("1 accounted, 0 no-show, 3 not on board");
  });

  it("copes with nothing open", () => {
    const s = musterSummary([c("A", "LB-1", "accounted")], started);
    expect(describeCloseOut(s, "no_show").consequence).toMatch(/^Everyone has an outcome\./);
  });
});

describe("mmss", () => {
  it("formats minutes and seconds", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(65)).toBe("1:05");
    expect(mmss(3600)).toBe("60:00");
  });
});
