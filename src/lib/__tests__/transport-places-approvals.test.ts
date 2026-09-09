import { describe, expect, it } from "vitest";
import { canonicalPlace, isSavedPlace, normalisePlaceName } from "@/lib/transport/places";
import { escalationNote, showApprovalsView, staleApprovals } from "@/lib/transport/approvals";
import { ghostShuttles } from "@/lib/transport/shuttles";
import type { Shuttle } from "@/types/transport";

const PLACES = [{ name: "Base main gate" }, { name: "Douala airport" }];

describe("saved places", () => {
  it("tidies whitespace", () => {
    expect(normalisePlaceName("  Base   main gate ")).toBe("Base main gate");
  });

  it("folds a typed name onto the saved spelling, case aside", () => {
    expect(canonicalPlace("base MAIN gate", PLACES)).toBe("Base main gate");
    expect(canonicalPlace("douala airport ", PLACES)).toBe("Douala airport");
  });

  it("keeps an unknown place as typed, tidied", () => {
    expect(canonicalPlace("  Hospital  Laquintinie", PLACES)).toBe("Hospital Laquintinie");
    expect(isSavedPlace("Hospital", PLACES)).toBe(false);
    expect(isSavedPlace("BASE MAIN GATE", PLACES)).toBe(true);
    expect(isSavedPlace("   ", PLACES)).toBe(false);
  });
});

describe("approval fallback", () => {
  const now = "2026-09-10T12:00:00Z";
  const rows = [
    { id: "old", status: "awaiting_approval", created_at: "2026-09-09T10:00:00Z" },
    { id: "fresh", status: "awaiting_approval", created_at: "2026-09-10T02:00:00Z" },
    { id: "decided", status: "pending", created_at: "2026-09-01T00:00:00Z" },
  ];

  it("escalates only requests still waiting past the delay", () => {
    expect(staleApprovals(rows, now, 24).map((r) => r.id)).toEqual(["old"]);
    expect(staleApprovals(rows, now, 8).map((r) => r.id)).toEqual(["old", "fresh"]);
  });

  it("never escalates when the delay is zero or nonsense", () => {
    expect(staleApprovals(rows, now, 0)).toEqual([]);
    expect(staleApprovals(rows, now, Number.NaN)).toEqual([]);
  });

  it("writes a readable note", () => {
    expect(escalationNote(24)).toBe("No decision from the line manager within 24 hours; passed to the dispatch desk.");
    expect(escalationNote(1)).toBe("No decision from the line manager within 1 hour; passed to the dispatch desk.");
  });

  it("shows the approvals view while approval is on or something still waits", () => {
    expect(showApprovalsView(true, 0)).toBe(true);
    expect(showApprovalsView(false, 2)).toBe(true);
    expect(showApprovalsView(false, 0)).toBe(false);
  });
});

describe("ghost shuttles", () => {
  const shuttle = (id: string, over: Partial<Shuttle> = {}): Shuttle => ({
    id,
    name: id,
    pickup: "Base",
    dropoff: "Airport",
    depart_time: "06:30",
    days_of_week: [1, 2, 3, 4, 5],
    passengers: 8,
    task_type: "passenger",
    driver_id: null,
    driver_name: null,
    vehicle_id: null,
    vehicle_name: null,
    is_active: true,
    ...over,
  });

  it("lists the day's runs the job has not made tasks for yet", () => {
    const shuttles = [shuttle("a"), shuttle("b", { depart_time: "17:00" }), shuttle("weekend", { days_of_week: [0, 6] })];
    // Thursday 2026-09-10; run "a" already exists as a task.
    const ghosts = ghostShuttles(shuttles, [{ shuttle_id: "a" }, { shuttle_id: null }], "2026-09-10");
    expect(ghosts.map((g) => g.shuttle.id)).toEqual(["b"]);
    expect(ghosts[0].departAt).toBe("2026-09-10T16:00:00.000Z");
  });

  it("is empty once every run is created", () => {
    expect(ghostShuttles([shuttle("a")], [{ shuttle_id: "a" }], "2026-09-10")).toEqual([]);
  });
});
