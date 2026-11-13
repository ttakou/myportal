import { describe, expect, it } from "vitest";
import { ticketCode, ticketPlates, ticketState } from "@/lib/canteen-ticket";

describe("meal ticket", () => {
  it("is valid on its own day until the meal is handed over", () => {
    expect(ticketState({ service_date: "2026-11-13", collected_at: null }, "2026-11-13")).toBe("valid");
    expect(ticketState({ service_date: "2026-11-13", collected_at: "2026-11-13T11:41:00Z" }, "2026-11-13")).toBe("collected");
  });

  it("waits for a later day and lapses after an earlier one", () => {
    expect(ticketState({ service_date: "2026-11-16", collected_at: null }, "2026-11-13")).toBe("upcoming");
    expect(ticketState({ service_date: "2026-11-12", collected_at: null }, "2026-11-13")).toBe("expired");
  });

  it("carries only the booking id, and counts the person plus visitors", () => {
    expect(ticketCode("2b3a7090-1111-2222-3333-444455556666")).toBe("2b3a7090-1111-2222-3333-444455556666");
    expect(ticketPlates(0)).toBe(1);
    expect(ticketPlates(2)).toBe(3);
  });
});
