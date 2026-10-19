/**
 * The morning email digest: one email per person with what the portal told
 * them in the last day, instead of one email per notification. Repeats of
 * the same alert collapse into one line with a count, and each section is
 * capped so a noisy day stays readable. Pure: no I/O, so it is tested.
 */

export interface DigestItem {
  category: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  approval: "Approvals",
  transport: "Transport",
  flight: "Flights",
  general: "General",
};
const CATEGORY_ORDER = ["approval", "transport", "flight", "general"];

/** Lines shown per section before "and N more". */
export const DIGEST_SECTION_LIMIT = 15;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function absolute(url: string | null, siteUrl: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, siteUrl).toString();
  } catch {
    return null;
  }
}

export interface DigestLine {
  title: string;
  body: string | null;
  url: string | null;
  count: number;
  latest: string;
}

export interface DigestSection {
  category: string;
  label: string;
  lines: DigestLine[];
  hidden: number;
}

/** Group by category, collapse identical titles (newest wins), newest first, capped. */
export function digestSections(items: DigestItem[], limit = DIGEST_SECTION_LIMIT): DigestSection[] {
  const byCat = new Map<string, Map<string, DigestLine>>();
  for (const it of items) {
    const lines = byCat.get(it.category) ?? new Map<string, DigestLine>();
    const prev = lines.get(it.title);
    if (!prev) lines.set(it.title, { title: it.title, body: it.body, url: it.url, count: 1, latest: it.created_at });
    else {
      prev.count += 1;
      if (it.created_at > prev.latest) Object.assign(prev, { body: it.body, url: it.url, latest: it.created_at });
    }
    byCat.set(it.category, lines);
  }
  const cats = [...byCat.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return cats.map((c) => {
    const all = [...byCat.get(c)!.values()].sort((a, b) => b.latest.localeCompare(a.latest));
    return { category: c, label: CATEGORY_LABEL[c] ?? c[0].toUpperCase() + c.slice(1), lines: all.slice(0, limit), hidden: Math.max(0, all.length - limit) };
  });
}

/** The email for one person: subject, HTML and plain text. */
export function buildDigest(input: { name: string | null; tenantName: string | null; items: DigestItem[]; siteUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const sections = digestSections(input.items);
  const total = input.items.length;
  const portal = input.tenantName?.trim() || "MyPortal";
  const subject = `${portal}: ${total} update${total === 1 ? "" : "s"} for you`;
  const hello = input.name?.trim() ? `Hello ${input.name.trim()},` : "Hello,";
  const prefsUrl = absolute("/account", input.siteUrl) ?? input.siteUrl;
  const homeUrl = absolute("/dashboard", input.siteUrl) ?? input.siteUrl;

  const htmlSections = sections
    .map((s) => {
      const lis = s.lines
        .map((l) => {
          const href = absolute(l.url, input.siteUrl);
          const title = escapeHtml(l.title) + (l.count > 1 ? ` <span style="color:#6b7280">×${l.count}</span>` : "");
          const head = href ? `<a href="${escapeHtml(href)}" style="color:#111827;font-weight:600;text-decoration:none">${title}</a>` : `<strong>${title}</strong>`;
          const body = l.body ? `<div style="color:#4b5563;font-size:13px;margin-top:2px">${escapeHtml(l.body)}</div>` : "";
          return `<li style="margin:0 0 10px">${head}${body}</li>`;
        })
        .join("");
      const more = s.hidden ? `<p style="color:#6b7280;font-size:13px;margin:0 0 4px">…and ${s.hidden} more in the portal.</p>` : "";
      return `<h3 style="font-size:15px;margin:20px 0 8px">${escapeHtml(s.label)}</h3><ul style="padding-left:18px;margin:0">${lis}</ul>${more}`;
    })
    .join("");

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;max-width:600px">` +
    `<p>${escapeHtml(hello)}</p>` +
    `<p>Here is what ${escapeHtml(portal)} has for you since yesterday.</p>` +
    htmlSections +
    `<p style="margin-top:24px"><a href="${escapeHtml(homeUrl)}">Open ${escapeHtml(portal)}</a></p>` +
    `<p style="color:#6b7280;font-size:12px;margin-top:24px">You get one email a day at most. Choose which kinds of update are emailed to you under <a href="${escapeHtml(prefsUrl)}">Account › Notifications</a>.</p>` +
    `</div>`;

  const textSections = sections
    .map((s) => {
      const lines = s.lines.map((l) => {
        const href = absolute(l.url, input.siteUrl);
        return `- ${l.title}${l.count > 1 ? ` (x${l.count})` : ""}${l.body ? `\n  ${l.body}` : ""}${href ? `\n  ${href}` : ""}`;
      });
      if (s.hidden) lines.push(`  ...and ${s.hidden} more in the portal.`);
      return `${s.label}\n${lines.join("\n")}`;
    })
    .join("\n\n");
  const text = `${hello}\n\nHere is what ${portal} has for you since yesterday.\n\n${textSections}\n\nOpen ${portal}: ${homeUrl}\nChoose which updates are emailed to you: ${prefsUrl}\n`;

  return { subject, html, text };
}

/** Whether an address can receive mail (accounts made without one get a placeholder). */
export function isDeliverableEmail(email: string | null | undefined): email is string {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith("@no-email.local"));
}

/** A single notification as an email body (HTML and text), content escaped, link absolute. */
export function notificationEmail(input: { title: string; body?: string | null; url?: string | null; siteUrl: string }): { html: string; text: string } {
  const href = absolute(input.url ?? null, input.siteUrl);
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;max-width:600px">` +
    `<p style="font-weight:600">${escapeHtml(input.title)}</p>` +
    (input.body ? `<p>${escapeHtml(input.body)}</p>` : "") +
    (href ? `<p><a href="${escapeHtml(href)}">Open in MyPortal</a></p>` : "") +
    `</div>`;
  const text = `${input.title}${input.body ? `\n\n${input.body}` : ""}${href ? `\n\n${href}` : ""}\n`;
  return { html, text };
}

/** "a@x.com, b@y.com; c@z.com" → the deliverable addresses, lower-cased, de-duplicated. */
export function parseMailboxes(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const out = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => isDeliverableEmail(s));
  return [...new Set(out)];
}
