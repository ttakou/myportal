import { describe, expect, it } from "vitest";
import { groupVisitors, parseGroupMembers } from "@/lib/visitors/group";

describe("group members", () => {
  it("reads one person per line with optional ID and phone in any order", () => {
    const members = parseGroupMembers(`Jean Mbarga, CM-123456, +237 699 00 11 22
Aïcha  Ndongo; 677889900
Paul Essomba\t
`);
    expect(members).toEqual([
      { full_name: "Jean Mbarga", id_document_number: "CM-123456", phone: "+237 699 00 11 22" },
      { full_name: "Aïcha Ndongo", id_document_number: null, phone: "677889900" },
      { full_name: "Paul Essomba", id_document_number: null, phone: null },
    ]);
  });

  it("skips blanks and repeats", () => {
    expect(parseGroupMembers("\n\nAnn\nann\nAnn, X1\n")).toEqual([
      { full_name: "Ann", id_document_number: null, phone: null },
      { full_name: "Ann", id_document_number: "X1", phone: null },
    ]);
  });
});

describe("grouped rows", () => {
  it("keeps group members together and marks the first as the header", () => {
    const rows = [
      { id: "a", group_id: null },
      { id: "b", group_id: "g" },
      { id: "c", group_id: null },
      { id: "d", group_id: "g" },
      { id: "e", group_id: "h" },
    ];
    const g = groupVisitors(rows);
    expect(g.ordered.map((r) => r.id)).toEqual(["a", "b", "d", "c", "e"]);
    expect([...g.headerFor.keys()]).toEqual(["b", "e"]);
    expect(g.headerFor.get("b")?.map((r) => r.id)).toEqual(["b", "d"]);
  });
});

describe("group arrival notice", () => {
  it("tells the host once, with the count, company, names and time", async () => {
    const { groupArrivalNotice } = await import("@/lib/visitors/group");
    expect(groupArrivalNotice(["Ann", "Bob"], "Schlumberger", "09:40")).toEqual({
      title: "Your visitors have arrived: 2 people from Schlumberger",
      body: "Ann, Bob checked in at reception at 09:40.",
    });
    const many = Array.from({ length: 12 }, (_, i) => `P${i + 1}`);
    expect(groupArrivalNotice(many, null, "10:00").body).toBe("P1, P2, P3, P4, P5, P6, P7, P8 and 4 more checked in at reception at 10:00.");
    expect(groupArrivalNotice(["Solo"], null, "11:15").title).toBe("Your visitors have arrived: 1 person");
  });
});
