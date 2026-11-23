import { describe, expect, it } from "vitest";
import { decideBy, dueLabel, earlierDate, isUrgent, noticeGroup, tripIdsOfRef, tripsRef } from "@/lib/notification-groups";

describe("sorting the bell", () => {
  it("puts each notice in its module's group", () => {
    expect(noticeGroup({ url: "/offshore?view=requests" })).toBe("offshore");
    expect(noticeGroup({ url: "/dashboard", module: "offshore" })).toBe("offshore");
    expect(noticeGroup({ url: "/performance/appraisals/1" })).toBe("performance");
    expect(noticeGroup({ url: "/training" })).toBe("performance");
    expect(noticeGroup({ url: "/transportation?x=1" })).toBe("transport");
    expect(noticeGroup({ url: "/visitors" })).toBe("other");
    expect(noticeGroup({ url: null })).toBe("other");
  });
});

describe("decisions due before the nightly run", () => {
  it("is due at 04:00 UTC (05:00 Douala) on the day it takes effect", () => {
    expect(decideBy("2026-11-24")).toBe("2026-11-24T04:00:00.000Z");
    expect(decideBy(null)).toBeNull();
    expect(earlierDate("2026-11-26", "2026-11-24")).toBe("2026-11-24");
    expect(earlierDate(null, "2026-11-24")).toBe("2026-11-24");
  });

  it("pins an unread decision whose deadline is near, never a read or past one", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    const due = "2026-11-24T04:00:00.000Z";
    expect(isUrgent({ read_at: null, due_at: due }, now)).toBe(true);
    expect(isUrgent({ read_at: "2026-11-23T11:00:00Z", due_at: due }, now)).toBe(false);
    expect(isUrgent({ read_at: null, due_at: "2026-11-23T04:00:00.000Z" }, now)).toBe(false);
    expect(isUrgent({ read_at: null, due_at: "2026-11-30T04:00:00.000Z" }, now)).toBe(false);
    expect(isUrgent({ read_at: null, due_at: null }, now)).toBe(false);
  });

  it("says when, on the site's clock", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(dueLabel("2026-11-24T04:00:00.000Z", now)).toBe("Decide before tonight's run (05:00 tomorrow)");
    expect(dueLabel("2026-11-26T04:00:00.000Z", now)).toBe("Decide before 05:00 on 26 Nov (nightly run)");
  });
});

describe("a trip request notice covers all its trips", () => {
  it("lists every trip, once and in order, and reads them back", () => {
    expect(tripsRef(["b", "a", "b"])).toBe("trips:a,b");
    expect(tripsRef([])).toBeNull();
    expect(tripIdsOfRef("trips:a,b")).toEqual(["a", "b"]);
    expect(tripIdsOfRef("move:x")).toEqual([]);
  });
});
