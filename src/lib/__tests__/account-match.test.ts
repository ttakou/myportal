import { describe, expect, it } from "vitest";
import {
  autoLinkTarget,
  compareNames,
  emailNameWords,
  findAccountMatches,
  isOrgDomain,
  nameWords,
} from "@/lib/account-match";

const ORG = ["cm.addaxpetroleum.com", "addaxpetroleum.com"];

describe("reading names", () => {
  it("ignores order, case, accents, separators and bracketed notes", () => {
    expect(nameWords("Alain.Talla")).toEqual(["alain", "talla"]);
    expect(nameWords("TALLA Alain")).toEqual(["alain", "talla"]);
    expect(nameWords("Célestin  Ouankap")).toEqual(["celestin", "ouankap"]);
    expect(nameWords("Bate Eban (Student)")).toEqual(["bate", "eban"]);
  });

  it("reads the name an email spells", () => {
    expect(emailNameWords("fred.bessong2@cm.addaxpetroleum.com")).toEqual(["bessong", "fred"]);
    expect(emailNameWords("nope")).toEqual([]);
  });

  it("compares names as sets of words", () => {
    expect(compareNames(["fred", "bessong"], ["bessong", "fred"])).toBe("exact");
    expect(compareNames(["fred", "bessong"], ["ayuk", "bessong", "fred"])).toBe("partial");
    expect(compareNames(["fred", "bessong"], ["fred", "tabi"])).toBeNull();
    expect(compareNames(["fred"], ["fred"])).toBeNull(); // one word is not enough
  });

  it("knows the organisation's own domains", () => {
    expect(isOrgDomain("a.b@CM.AddaxPetroleum.com", ORG)).toBe(true);
    expect(isOrgDomain("a.b@gmail.com", ORG)).toBe(false);
    expect(isOrgDomain("a.b@uni.strath.ac.uk", ORG)).toBe(false);
  });
});

describe("linking a first sign-in to the existing account", () => {
  const roster = [
    { id: "stub", full_name: "BESSONG Fred", signedIn: false },
    { id: "other", full_name: "Fred Tabi", signedIn: false },
    { id: "longer", full_name: "Fred Ayuk Bessong", signedIn: false },
  ];

  it("finds the roster account by name or by the email's name, exact first", () => {
    const m = findAccountMatches({ email: "fred.bessong@cm.addaxpetroleum.com", fullName: "Fred Bessong" }, roster);
    expect(m.map((x) => [x.id, x.strength])).toEqual([
      ["stub", "exact"],
      ["longer", "partial"],
    ]);
    // The Microsoft display name may differ; the email still finds them.
    const byEmail = findAccountMatches({ email: "fred.bessong@cm.addaxpetroleum.com", fullName: "F. B." }, roster);
    expect(byEmail[0]).toMatchObject({ id: "stub", strength: "exact" });
  });

  it("links automatically only from the organisation's domain, to exactly one unused account", () => {
    const signIn = { email: "fred.bessong@cm.addaxpetroleum.com", fullName: "Fred Bessong" };
    expect(autoLinkTarget(signIn, findAccountMatches(signIn, roster), ORG)).toBe("stub");

    // An outside account can call itself anything: never automatic.
    const outside = { email: "fred.bessong@gmail.com", fullName: "Fred Bessong" };
    expect(autoLinkTarget(outside, findAccountMatches(outside, roster), ORG)).toBeNull();

    // Two people with the same name: an admin decides.
    const twins = [...roster, { id: "twin", full_name: "Fred Bessong", signedIn: false }];
    expect(autoLinkTarget(signIn, findAccountMatches(signIn, twins), ORG)).toBeNull();

    // An account somebody already signs in to is theirs, not a placeholder.
    const used = [{ id: "used", full_name: "Fred Bessong", signedIn: true }];
    expect(autoLinkTarget(signIn, findAccountMatches(signIn, used), ORG)).toBeNull();

    // Only a partial match: an admin decides.
    const partialOnly = [{ id: "longer", full_name: "Fred Ayuk Bessong", signedIn: false }];
    expect(autoLinkTarget(signIn, findAccountMatches(signIn, partialOnly), ORG)).toBeNull();
  });
});
