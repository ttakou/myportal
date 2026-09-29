import { describe, expect, it } from "vitest";
import { depositTimestamp, lastFridayOfMonth } from "@/lib/savings-dates";

describe("last Friday of the month", () => {
  it("finds it whatever weekday the month ends on", () => {
    expect(lastFridayOfMonth("2026-07")).toBe("2026-07-31"); // month ends on the Friday
    expect(lastFridayOfMonth("2026-08")).toBe("2026-08-28"); // ends Monday
    expect(lastFridayOfMonth("2026-09-01")).toBe("2026-09-25"); // period form
    expect(lastFridayOfMonth("2024-01")).toBe("2024-01-26");
    expect(lastFridayOfMonth("2024-02")).toBe("2024-02-23"); // leap February ends Thursday
    expect(lastFridayOfMonth("2026-12")).toBe("2026-12-25");
  });
});

describe("deposit timestamp", () => {
  it("dates a past month on its last Friday, and never in the future", () => {
    expect(depositTimestamp("2026-08", "2026-09-29T08:00:00.000Z")).toBe("2026-08-28T12:00:00.000Z");
    expect(depositTimestamp("2026-09", "2026-09-20T08:00:00.000Z")).toBe("2026-09-20T08:00:00.000Z");
  });
});
