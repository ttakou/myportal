import { describe, expect, it } from "vitest";
import {
  linkErrorMessage,
  providerLabel,
  signInMethods,
  type AuthIdentityLike,
} from "@/lib/sign-in-methods";

const identity = (provider: string, email: string | null = null): AuthIdentityLike => ({
  identity_id: `id-${provider}`,
  provider,
  identity_data: email ? { email } : null,
});

describe("signInMethods", () => {
  it("lists every provider the portal offers, linked or not", () => {
    const rows = signInMethods([identity("google", "someone@gmail.com")]);
    expect(rows.map((r) => r.provider)).toEqual(["email", "azure", "google"]);
    expect(rows.map((r) => r.linked)).toEqual([false, false, true]);
  });

  it("offers a link for an unlinked provider but never for a password", () => {
    // A password is set, not linked, so a "Link" button there would go nowhere.
    const rows = signInMethods([identity("google")]);
    const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));
    expect(byProvider.email.canLink).toBe(false);
    expect(byProvider.azure.canLink).toBe(true);
    expect(byProvider.google.canLink).toBe(false);
  });

  it("refuses to remove the only way in", () => {
    const rows = signInMethods([identity("azure")]);
    expect(rows.find((r) => r.provider === "azure")?.canRemove).toBe(false);
  });

  it("allows removal once a second method exists", () => {
    const rows = signInMethods([identity("azure"), identity("google")]);
    expect(rows.filter((r) => r.linked).every((r) => r.canRemove)).toBe(true);
  });

  it("carries the address each provider knows them by", () => {
    // The two rarely agree — the whole duplicate-account problem starts here.
    const rows = signInMethods([
      identity("google", "alex@gmail.com"),
      identity("azure", "alex@work.example"),
    ]);
    const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));
    expect(byProvider.google.email).toBe("alex@gmail.com");
    expect(byProvider.azure.email).toBe("alex@work.example");
    expect(byProvider.email.email).toBeNull();
  });

  it("shows a provider it does not offer rather than hiding it", () => {
    const rows = signInMethods([identity("email"), identity("github", "a@b.c")]);
    expect(rows.map((r) => r.provider)).toEqual(["email", "azure", "google", "github"]);
    expect(rows.find((r) => r.provider === "github")?.canRemove).toBe(true);
  });

  it("counts one provider once when it appears twice", () => {
    const rows = signInMethods([identity("google"), identity("google")]);
    // Two google rows are still one way in, so nothing may be removed.
    expect(rows.find((r) => r.provider === "google")?.canRemove).toBe(false);
  });

  it("has nothing linked for an account with no identities", () => {
    expect(signInMethods([]).every((r) => !r.linked)).toBe(true);
  });
});

describe("providerLabel", () => {
  it("names the providers the way the login page does", () => {
    expect(providerLabel("azure")).toBe("Microsoft");
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("email")).toBe("Email and password");
  });

  it("falls back to the provider's own name", () => {
    expect(providerLabel("github")).toBe("Github");
  });
});

describe("linkErrorMessage", () => {
  it("explains the disabled switch instead of repeating it", () => {
    expect(linkErrorMessage("Manual linking is disabled")).toMatch(/administrator has to enable/i);
  });

  it("explains that the identity belongs to another account", () => {
    expect(linkErrorMessage("Identity is already linked to another user")).toMatch(
      /belongs to another account/i,
    );
  });

  it("passes anything else through unchanged", () => {
    expect(linkErrorMessage("Network request failed")).toBe("Network request failed");
  });
});
