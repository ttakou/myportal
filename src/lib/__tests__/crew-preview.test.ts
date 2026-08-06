import { describe, expect, it } from "vitest";
import { crewManifestPreview, nextCrewChangeDate } from "@/lib/offshore/crew-preview";

const member = (over: Partial<Parameters<typeof crewManifestPreview>[0]["roster"][number]>) => ({
  profile_id: "p1",
  full_name: "Zoe Ayuk",
  email: "zoe@example.com",
  crew_id: "crew-a",
  position: "Mechanic",
  company: "Contractor Ltd",
  travel_eligible: true,
  ...over,
});

describe("crewManifestPreview", () => {
  it("lists only this crew, in name order", () => {
    const p = crewManifestPreview({
      crewId: "crew-a",
      roster: [
        member({ profile_id: "p1", full_name: "Zoe Ayuk" }),
        member({ profile_id: "p2", full_name: "Alan Bate" }),
        member({ profile_id: "p3", full_name: "Other Crew", crew_id: "crew-b" }),
      ],
      onboard: [],
    });
    expect(p.members.map((m) => m.name)).toEqual(["Alan Bate", "Zoe Ayuk"]);
  });

  it("splits who is already aboard from who is ashore", () => {
    const p = crewManifestPreview({
      crewId: "crew-a",
      roster: [member({ profile_id: "p1" }), member({ profile_id: "p2", full_name: "Alan Bate" })],
      onboard: [{ profile_id: "p1", room_label: "B 313" }],
    });
    expect(p.onboardCount).toBe(1);
    expect(p.ashoreCount).toBe(1);
    expect(p.members.find((m) => m.profile_id === "p1")?.room_label).toBe("B 313");
  });

  it("counts people who cannot travel", () => {
    const p = crewManifestPreview({
      crewId: "crew-a",
      roster: [member({ profile_id: "p1", travel_eligible: false }), member({ profile_id: "p2" })],
      onboard: [],
    });
    expect(p.blockedCount).toBe(1);
  });

  it("falls back to the email when there is no name", () => {
    const p = crewManifestPreview({
      crewId: "crew-a",
      roster: [member({ full_name: null, email: "nobody@example.com" })],
      onboard: [],
    });
    expect(p.members[0].name).toBe("nobody@example.com");
  });

  it("ignores visitors on board, who carry no profile", () => {
    // Visitor rows come through with a null profile_id; they must not be
    // matched against a crew member by accident.
    const p = crewManifestPreview({
      crewId: "crew-a",
      roster: [member({ profile_id: "p1" })],
      onboard: [{ profile_id: null, room_label: "B 101" }],
    });
    expect(p.onboardCount).toBe(0);
  });

  it("is empty for a crew with nobody on it", () => {
    const p = crewManifestPreview({ crewId: "crew-z", roster: [member({})], onboard: [] });
    expect(p.members).toEqual([]);
    expect(p.ashoreCount).toBe(0);
  });
});

describe("nextCrewChangeDate", () => {
  // 21/21 from 2026-06-02: boundaries at 06-02, 07-14, 08-25, …
  const CYCLE = { offshore_days: 21, onshore_days: 21, cycle_start_date: "2026-06-02" };

  it("gives the next boundary for a joining run", () => {
    expect(nextCrewChangeDate({ todayIso: "2026-08-06", direction: "out", cycle: CYCLE })).toBe(
      "2026-08-25",
    );
  });

  it("steps back one onshore leg for a returning run", () => {
    expect(nextCrewChangeDate({ todayIso: "2026-08-06", direction: "in", cycle: CYCLE })).toBe(
      "2026-08-04",
    );
  });

  it("uses the cycle start itself before the cycle has begun", () => {
    expect(nextCrewChangeDate({ todayIso: "2026-05-01", direction: "out", cycle: CYCLE })).toBe(
      "2026-06-02",
    );
  });

  it("moves to the following boundary on the boundary day itself", () => {
    // `now > start` is false only on the start date; on a later boundary the
    // ceil lands on that same day.
    expect(nextCrewChangeDate({ todayIso: "2026-07-14", direction: "out", cycle: CYCLE })).toBe(
      "2026-07-14",
    );
  });

  it("has no date without a cycle", () => {
    expect(nextCrewChangeDate({ todayIso: "2026-08-06", direction: "out", cycle: null })).toBeNull();
    expect(
      nextCrewChangeDate({
        todayIso: "2026-08-06",
        direction: "out",
        cycle: { ...CYCLE, cycle_start_date: null },
      }),
    ).toBeNull();
  });

  it("has no date for a degenerate pattern", () => {
    expect(
      nextCrewChangeDate({
        todayIso: "2026-08-06",
        direction: "out",
        cycle: { ...CYCLE, offshore_days: 0, onshore_days: 0 },
      }),
    ).toBeNull();
  });
});
