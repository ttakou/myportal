import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmailBatch, type EmailMessage } from "@/lib/email";
import { buildDigest, isDeliverableEmail, type DigestItem } from "@/lib/email-digest-format";

type Row = Record<string, any>;
const PAGE = 1000;
/** Only notifications from the last day and a bit are mailed; anything older has aged out. */
const WINDOW_HOURS = 26;

export interface DigestRun {
  ok: boolean;
  configured: boolean;
  /** People with something to read. */
  recipients: number;
  /** Emails accepted by the provider. */
  sent: number;
  /** Notifications covered (sent, opted out, or no address). */
  handled: number;
  /** People skipped: no deliverable address, inactive, or every category opted out. */
  skipped: number;
  errors: string[];
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * The morning digest (Vercel Cron, see vercel.json): every notification of
 * the last day not yet emailed is grouped per person into one email. People
 * who turned email off for a category, have no real address, or are
 * inactive get nothing for it. What was handled is marked so it is never
 * mailed twice; a batch the provider refuses stays unmarked and is retried
 * by tomorrow's run while it is still inside the window.
 */
export async function runEmailDigest(nowIso: string = new Date().toISOString()): Promise<DigestRun> {
  const run: DigestRun = { ok: true, configured: isEmailConfigured(), recipients: 0, sent: 0, handled: 0, skipped: 0, errors: [] };
  if (!run.configured) return run;
  const admin = createAdminClient();
  if (!admin) return { ...run, ok: false, errors: ["Service-role key missing."] };

  const since = new Date(Date.parse(nowIso) - WINDOW_HOURS * 3_600_000).toISOString();
  const pending: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, tenant_id, profile_id, category, title, body, url, created_at")
      .is("emailed_at", null)
      .gte("created_at", since)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { ...run, ok: false, errors: [error.message] };
    pending.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }
  if (pending.length === 0) return run;

  const byProfile = new Map<string, Row[]>();
  for (const n of pending) {
    const list = byProfile.get(n.profile_id) ?? [];
    list.push(n);
    byProfile.set(n.profile_id, list);
  }
  const profileIds = [...byProfile.keys()];

  const people = new Map<string, Row>();
  const muted = new Map<string, Set<string>>();
  for (const ids of chunk(profileIds, 200)) {
    const [{ data: profs }, { data: prefs }] = await Promise.all([
      admin.from("profiles").select("id, email, full_name, is_active").in("id", ids),
      admin.from("notification_preferences").select("profile_id, category").eq("email", false).in("profile_id", ids),
    ]);
    for (const p of (profs ?? []) as Row[]) people.set(p.id, p);
    for (const r of (prefs ?? []) as Row[]) {
      const s = muted.get(r.profile_id) ?? new Set<string>();
      s.add(r.category);
      muted.set(r.profile_id, s);
    }
  }
  const tenantIds = [...new Set(pending.map((n) => n.tenant_id as string))];
  const { data: tenants } = await admin.from("tenants").select("id, name").in("id", tenantIds);
  const tenantName = new Map(((tenants ?? []) as Row[]).map((t) => [t.id as string, t.name as string]));
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mportals.com";

  const outbox: { message: EmailMessage; ids: string[] }[] = [];
  const settled: string[] = [];
  for (const [pid, notes] of byProfile) {
    const p = people.get(pid);
    const off = muted.get(pid) ?? new Set<string>();
    const items = notes.filter((n) => !off.has(n.category));
    if (!p || p.is_active === false || !isDeliverableEmail(p.email) || items.length === 0) {
      run.skipped += 1;
      settled.push(...notes.map((n) => n.id as string));
      continue;
    }
    run.recipients += 1;
    const d = buildDigest({
      name: p.full_name ?? null,
      tenantName: tenantName.get(notes[0].tenant_id) ?? null,
      siteUrl,
      items: items.map((n): DigestItem => ({ category: n.category, title: n.title, body: n.body ?? null, url: n.url ?? null, created_at: n.created_at })),
    });
    outbox.push({ message: { to: p.email, subject: d.subject, html: d.html, text: d.text }, ids: notes.map((n) => n.id as string) });
  }

  for (const batch of chunk(outbox, 100)) {
    const res = await sendEmailBatch(batch.map((b) => b.message));
    if (res.ok) {
      run.sent += batch.length;
      settled.push(...batch.flatMap((b) => b.ids));
    } else {
      run.ok = false;
      run.errors.push(res.error ?? "Batch refused.");
    }
  }

  for (const ids of chunk(settled, 500)) {
    const { error } = await admin.from("notifications").update({ emailed_at: nowIso }).in("id", ids);
    if (error) run.errors.push(error.message);
  }
  run.handled = settled.length;
  return run;
}
