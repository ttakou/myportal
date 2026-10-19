import { describe, expect, it } from "vitest";
import { buildDigest, digestSections, escapeHtml, isDeliverableEmail, type DigestItem } from "@/lib/email-digest-format";

const item = (category: string, title: string, created_at: string, over: Partial<DigestItem> = {}): DigestItem => ({
  category,
  title,
  body: null,
  url: null,
  created_at,
  ...over,
});

describe("digest sections", () => {
  it("groups by category in a fixed order and collapses repeats, newest first", () => {
    const s = digestSections([
      item("general", "Still on site after 20:00: A", "2026-10-18T19:00:00Z"),
      item("approval", "Overdue appraisal task", "2026-10-18T07:00:00Z", { body: "old" }),
      item("approval", "Overdue appraisal task", "2026-10-19T07:00:00Z", { body: "new", url: "/performance" }),
      item("transport", "Not started: Base → Port", "2026-10-18T06:00:00Z"),
    ]);
    expect(s.map((x) => x.label)).toEqual(["Approvals", "Transport", "General"]);
    expect(s[0].lines).toEqual([{ title: "Overdue appraisal task", body: "new", url: "/performance", count: 2, latest: "2026-10-19T07:00:00Z" }]);
  });

  it("caps a section and counts the rest", () => {
    const many = Array.from({ length: 20 }, (_, i) => item("general", `Alert ${i}`, `2026-10-18T${String(i).padStart(2, "0")}:00:00Z`));
    const [g] = digestSections(many, 15);
    expect(g.lines).toHaveLength(15);
    expect(g.hidden).toBe(5);
    expect(g.lines[0].title).toBe("Alert 19");
  });
});

describe("digest email", () => {
  it("addresses the person, links absolutely, escapes content and points to preferences", () => {
    const d = buildDigest({
      name: "Alex",
      tenantName: "Addax Petroleum",
      siteUrl: "https://mportals.com",
      items: [item("approval", "Approve <Jane>'s trip", "2026-10-19T07:00:00Z", { url: "/out-of-town?view=approvals" })],
    });
    expect(d.subject).toBe("Addax Petroleum: 1 update for you");
    expect(d.html).toContain("Hello Alex,");
    expect(d.html).toContain("https://mportals.com/out-of-town?view=approvals");
    expect(d.html).toContain("Approve &lt;Jane&gt;&#39;s trip");
    expect(d.html).toContain("https://mportals.com/account");
    expect(d.text).toContain("- Approve <Jane>'s trip\n  https://mportals.com/out-of-town?view=approvals");
  });

  it("counts every notification in the subject", () => {
    const d = buildDigest({ name: null, tenantName: null, siteUrl: "https://x.test", items: [item("general", "A", "2026-10-19T01:00:00Z"), item("general", "A", "2026-10-19T02:00:00Z")] });
    expect(d.subject).toBe("MyPortal: 2 updates for you");
    expect(d.text).toContain("- A (x2)");
  });
});

describe("helpers", () => {
  it("escapes HTML and knows a placeholder address is not deliverable", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    expect(isDeliverableEmail("jane@cm.addaxpetroleum.com")).toBe(true);
    expect(isDeliverableEmail("pending-ab12@no-email.local")).toBe(false);
    expect(isDeliverableEmail(null)).toBe(false);
    expect(isDeliverableEmail("not an email")).toBe(false);
  });
});

describe("desk mailbox", () => {
  it("reads one or several addresses, any separator, and drops junk", async () => {
    const { parseMailboxes } = await import("@/lib/email-digest-format");
    expect(parseMailboxes("APCCTransport.Request@cm.addaxpetroleum.com")).toEqual(["apcctransport.request@cm.addaxpetroleum.com"]);
    expect(parseMailboxes("a@x.com, b@y.com;\nc@z.com a@x.com")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
    expect(parseMailboxes("not-an-address, x@no-email.local")).toEqual([]);
    expect(parseMailboxes(undefined)).toEqual([]);
  });

  it("formats one notification as an escaped email with an absolute link", async () => {
    const { notificationEmail } = await import("@/lib/email-digest-format");
    const e = notificationEmail({ title: "New transport request", body: "Base → <Port>", url: "/transportation?view=dispatch", siteUrl: "https://mportals.com" });
    expect(e.html).toContain("Base → &lt;Port&gt;");
    expect(e.html).toContain('href="https://mportals.com/transportation?view=dispatch"');
    expect(e.text).toBe("New transport request\n\nBase → <Port>\n\nhttps://mportals.com/transportation?view=dispatch\n");
  });
});
