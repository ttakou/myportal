import { describe, expect, it } from "vitest";
import { badgeBoard, parseBadgeNumbers } from "@/lib/visitors/badges";
import { addDays, passesEndingOn } from "@/lib/visitors/daily";

describe("badge pool", () => {
  it("reads lists and ranges, keeping prefix and padding", () => {
    expect(parseBadgeNumbers("V001-V003")).toEqual(["V001", "V002", "V003"]);
    expect(parseBadgeNumbers("8-10, A, a, 12–13")).toEqual(["8", "9", "10", "A", "12", "13"]);
    expect(parseBadgeNumbers("V01 - 03\nX")).toEqual(["V01", "V02", "V03", "X"]);
    expect(parseBadgeNumbers("A1-B3")).toEqual(["A1-B3"]);
  });

  it("splits the pool into out, free and unlisted", () => {
    const pool = [
      { id: "1", number: "V001", is_active: true },
      { id: "2", number: "V002", is_active: true },
      { id: "3", number: "V003", is_active: false },
    ];
    const onSite = [
      { id: "a", full_name: "Ann", badge_no: "v001" },
      { id: "b", full_name: "Bob", badge_no: "T7" },
      { id: "c", full_name: "Cy", badge_no: null },
    ];
    const b = badgeBoard(pool, onSite);
    expect(b.total).toBe(2);
    expect(b.out.map((o) => [o.number, o.holder.full_name])).toEqual([["V001", "Ann"]]);
    expect(b.free).toEqual(["V002"]);
    expect(b.unlisted).toEqual(["T7"]);
  });
});

describe("pass expiry", () => {
  it("finds passes ending on a date, ignoring cancelled ones, and adds days", () => {
    const passes = [
      { id: "a", status: "checked_out", visit_date: "2026-09-01", visit_until: "2026-09-13" },
      { id: "b", status: "cancelled", visit_date: "2026-09-01", visit_until: "2026-09-13" },
      { id: "c", status: "pre_registered", visit_date: "2026-09-01", visit_until: "2026-09-14" },
    ];
    expect(passesEndingOn(passes, "2026-09-13").map((p) => p.id)).toEqual(["a"]);
    expect(addDays("2026-09-10", 3)).toBe("2026-09-13");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});
