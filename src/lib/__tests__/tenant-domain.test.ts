import { describe, expect, it } from "vitest";
import { resolveTenantSlug } from "@/lib/tenant-domain";

describe("resolveTenantSlug", () => {
  const root = "mportals.com";

  it("extracts the subdomain as the tenant slug", () => {
    expect(resolveTenantSlug("acme-oil.mportals.com", root)).toBe("acme-oil");
  });

  it("returns null for the bare root domain", () => {
    expect(resolveTenantSlug("mportals.com", root)).toBeNull();
  });

  it("returns null for reserved subdomains", () => {
    expect(resolveTenantSlug("www.mportals.com", root)).toBeNull();
    expect(resolveTenantSlug("api.mportals.com", root)).toBeNull();
  });

  it("ignores ports and casing", () => {
    expect(resolveTenantSlug("Acme.localhost:3000", "localhost")).toBe("acme");
  });

  it("never resolves a slug for a foreign domain (tenant isolation)", () => {
    expect(resolveTenantSlug("evil.example.com", root)).toBeNull();
    expect(resolveTenantSlug("mportals.com.evil.com", root)).toBeNull();
  });

  it("handles empty / missing host", () => {
    expect(resolveTenantSlug(null, root)).toBeNull();
    expect(resolveTenantSlug("", root)).toBeNull();
  });

  it("takes the left-most label for nested subdomains", () => {
    expect(resolveTenantSlug("a.b.mportals.com", root)).toBe("a");
  });
});
