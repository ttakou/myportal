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
