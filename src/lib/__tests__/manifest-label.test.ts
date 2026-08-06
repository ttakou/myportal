import { describe, expect, it } from "vitest";
import { manifestDescriptor } from "@/lib/offshore/manifest-label";

const base = {
  direction: "out" as const,
  transport_mode: "helicopter",
  scheduled_date: "2026-08-06",
  crew_name: "CREW A2",
  installation_name: "Juliet",
};

describe("manifestDescriptor", () => {
  it("calls a joining run MOB, going shore → installation", () => {
    const d = manifestDescriptor(base);
    expect(d.movement).toBe("MOB");
    expect(d.route).toBe("Shore → Juliet");
  });

  it("calls a leaving run DEMOB, going installation → shore", () => {
    const d = manifestDescriptor({ ...base, direction: "in" });
    expect(d.movement).toBe("DEMOB");
    expect(d.route).toBe("Juliet → Shore");
  });

  it("names the transport", () => {
    expect(manifestDescriptor(base).transport).toBe("Helicopter");
    expect(manifestDescriptor({ ...base, transport_mode: "boat" }).transport).toBe("Boat");
  });

  it("says so when the transport was never set", () => {
    // Several production manifests carry transport_mode null.
    expect(manifestDescriptor({ ...base, transport_mode: null }).transport).toBe(
      "Transport not set",
    );
  });

  it("still reads as a direction when no installation is recorded", () => {
    // Every production manifest has installation_id null.
    const d = manifestDescriptor({ ...base, installation_name: null });
    expect(d.route).toBe("Shore → Installation");
    expect(manifestDescriptor({ ...base, direction: "in", installation_name: null }).route).toBe(
      "Installation → Shore",
    );
  });

  it("ignores a blank installation name", () => {
    expect(manifestDescriptor({ ...base, installation_name: "   " }).route).toBe(
      "Shore → Installation",
    );
  });

  it("builds a one-line summary with everything a reviewer needs", () => {
    expect(manifestDescriptor(base).summary).toBe(
      "CREW A2 · MOB · Helicopter · Shore → Juliet · 2026-08-06",
    );
  });

  it("drops the crew from the summary when a movement has none", () => {
    expect(manifestDescriptor({ ...base, crew_name: null }).summary).toBe(
      "MOB · Helicopter · Shore → Juliet · 2026-08-06",
    );
  });

  it("keeps the crew-change date verbatim", () => {
    expect(manifestDescriptor(base).date).toBe("2026-08-06");
  });

  it("spells the movement out in long form", () => {
    expect(manifestDescriptor(base).movementLong).toBe(
      "Mobilisation — joining the installation",
    );
    expect(manifestDescriptor({ ...base, direction: "in" }).movementLong).toBe(
      "Demobilisation — leaving the installation",
    );
  });

  it("never uses the ambiguous words inbound/outbound", () => {
    for (const direction of ["out", "in"] as const) {
      const d = manifestDescriptor({ ...base, direction });
      expect(d.summary.toLowerCase()).not.toContain("bound");
    }
  });
});
