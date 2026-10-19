import { describe, expect, it } from "vitest";
import {
  clampPeriod,
  datesBetween,
  memberDay,
  minutesClock,
  rotationPhase,
  summarise,
  workHours,
} from "@/lib/team-attendance-format";

const hours = workHours("07:30", "16:30");
const office = { rotation: null };
// 28/28 from 1 Oct: offshore 1–28 Oct, field break 29 Oct – 25 Nov.
const rotational = { rotation: { offshore_days: 28, onshore_days: 28, cycle_start_date: "2026-10-01" } };

describe("a day in the line", () => {
  it("reads a check-in as present, flags late and early on the site clock", () => {
    // 07:45 and 15:00 site time are 06:45 and 14:00 UTC.
    const d = memberDay(
      office,
      { profile_id: "a", attendance_date: "2026-10-16", check_in_at: "2026-10-16T06:45:00Z", check_out_at: "2026-10-16T14:00:00Z" },
      "2026-10-16",
      "2026-10-19",
      hours,
    );
    expect(d).toMatchObject({ status: "present", late: true, leftEarly: true });
  });

  it("is on site today until they check out, and on time is not late", () => {
    const d = memberDay(
      office,
      { profile_id: "a", attendance_date: "2026-10-19", check_in_at: "2026-10-19T06:30:00Z", check_out_at: null },
      "2026-10-19",
      "2026-10-19",
      hours,
    );
    expect(d).toMatchObject({ status: "on_site", late: false, leftEarly: false });
  });

  it("calls a workday with no check-in an absence, but not a weekend", () => {
    expect(memberDay(office, undefined, "2026-10-16", "2026-10-19", hours).status).toBe("absent");
    expect(memberDay(office, undefined, "2026-10-17", "2026-10-19", hours).status).toBe("weekend");
  });

  it("follows the crew's rotation for rotational staff, never calling it an absence", () => {
    expect(memberDay(rotational, undefined, "2026-10-16", "2026-10-19", hours).status).toBe("offshore");
    expect(memberDay(rotational, undefined, "2026-11-02", "2026-11-03", hours).status).toBe("field_break");
    expect(rotationPhase(rotational.rotation, "2026-10-28")).toBe("offshore");
    expect(rotationPhase(rotational.rotation, "2026-10-29")).toBe("field_break");
    expect(rotationPhase(null, "2026-10-29")).toBeNull();
  });

  it("switches the late flag off when no working day is set", () => {
    const d = memberDay(
      office,
      { profile_id: "a", attendance_date: "2026-10-16", check_in_at: "2026-10-16T10:00:00Z", check_out_at: null },
      "2026-10-16",
      "2026-10-19",
      workHours("", null),
    );
    expect(d.late).toBe(false);
  });
});

describe("a period", () => {
  it("counts presence, absence, rotation and the average arrival", () => {
    const days = datesBetween("2026-10-12", "2026-10-18").map((date) =>
      memberDay(
        office,
        date === "2026-10-12" || date === "2026-10-13"
          ? { profile_id: "a", attendance_date: date, check_in_at: `${date}T06:00:00Z`, check_out_at: `${date}T16:00:00Z` }
          : undefined,
        date,
        "2026-10-19",
        hours,
      ),
    );
    // Mon–Tue in at 07:00 site time, Wed–Fri absent, Sat–Sun weekend.
    expect(summarise(days)).toEqual({ present: 2, absent: 3, late: 0, leftEarly: 0, rotation: 0, avgArrival: 420 });
    expect(minutesClock(420)).toBe("07:00");
    expect(minutesClock(null)).toBe("—");
  });

  it("never runs past today, never back to front, and caps the span", () => {
    expect(clampPeriod("2026-10-01", "2026-12-31", "2026-10-19")).toEqual({ from: "2026-10-01", to: "2026-10-19" });
    expect(clampPeriod("2026-10-25", "2026-10-20", "2026-10-30")).toEqual({ from: "2026-10-20", to: "2026-10-20" });
    expect(clampPeriod("2025-01-01", "2026-10-19", "2026-10-19")).toEqual({ from: "2026-07-20", to: "2026-10-19" });
  });
});
