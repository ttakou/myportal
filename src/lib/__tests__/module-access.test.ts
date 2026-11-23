import { describe, expect, it } from "vitest";
import { openToAll } from "@/lib/module-access";

describe("modules open to every signed-in member", () => {
  it("opens offshore to everyone, and nothing else", () => {
    expect(openToAll("offshore")).toBe(true);
    expect(openToAll("savings")).toBe(false);
    expect(openToAll("performance")).toBe(false);
  });
});
