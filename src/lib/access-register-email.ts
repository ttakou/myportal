import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getAccessRegister, type AccessRegister } from "@/lib/access-register";

/**
 * Monthly Access Register delivery. On the 1st of each month the daily cron
 * emails last month's register — summary, anomalies and the full CSV attached —
 * to each tenant's security/reception audience (visitors:operate holders) and
 * admins. Best-effort: skips silently when email isn't configured.
 */

function lastMonthRange(today: Date): { from: string; to: string; label: string } {
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const label = first.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { from: iso(first), to: iso(last), label };
}

function csvOf(reg: AccessRegister): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const clock = (ts: string | null) => (ts ? ts.slice(11, 16) : "");
  const rows = [
    ["Date", "Name", "Type", "Department/Company", "Detail", "Badge", "Vehicle", "In (UTC)", "Out (UTC)"],
    ...reg.entries.map((e) => [
      e.date,
      e.name,
      e.kind,
      e.org ?? "",
      e.detail ?? "",
      e.badge ?? "",
      e.vehicle ?? "",
      clock(e.check_in_at),
      clock(e.check_out_at),
    ]),
  ];
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

function htmlOf(reg: AccessRegister, label: string, url: string): string {
  const s = reg.summary;
  const stat = (k: string, v: number) =>
    `<td style="padding:6px 14px 6px 0"><div style="font-size:20px;font-weight:600">${v}</div><div style="font-size:11px;color:#666">${k}</div></td>`;
  const anomalies = reg.anomalies.slice(0, 15);
  const anomalyRows = anomalies
    .map(
      (a) =>
        `<tr><td style="padding:3px 8px;border-bottom:1px solid #eee">${a.date}</td><td style="padding:3px 8px;border-bottom:1px solid #eee">${a.name}</td><td style="padding:3px 8px;border-bottom:1px solid #eee">${a.detail}</td></tr>`,
    )
    .join("");
  return (
    `<div style="font-family:sans-serif;font-size:13px;color:#222">` +
    `<p>Monthly <strong>Access Register</strong> — ${label}. The full entry/exit log is attached as CSV.</p>` +
    `<table style="border-collapse:collapse"><tr>${stat("Entries", s.total)}${stat("People", s.distinctPeople)}${stat("Staff", s.staff)}${stat("Contractors", s.contractors)}${stat("Visitors", s.visitors)}${stat("No exit logged", s.openExits)}</tr></table>` +
    (anomalies.length
      ? `<p style="margin-top:14px"><strong>Anomalies (${reg.anomalies.length})</strong>${reg.anomalies.length > 15 ? " — first 15" : ""}:</p><table style="border-collapse:collapse;font-size:12px">${anomalyRows}</table>`
      : `<p style="margin-top:14px">No anomalies recorded.</p>`) +
    `<p style="margin-top:14px"><a href="${url}">Open the interactive register</a></p>` +
    `</div>`
  );
}

/**
 * Send last month's register per tenant. Runs from the daily cron; only acts
 * on the 1st (UTC) unless `force` is set (manual re-run/testing).
 */
export async function runMonthlyAccessRegister(opts?: {
  force?: boolean;
}): Promise<{ ok: boolean; sent: number; skipped?: string }> {
  const today = new Date();
  if (!opts?.force && today.getUTCDate() !== 1) {
    return { ok: true, sent: 0, skipped: "not the 1st" };
  }
  if (!isEmailConfigured()) return { ok: true, sent: 0, skipped: "email not configured" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, sent: 0, skipped: "service-role key missing" };

  const { from, to, label } = lastMonthRange(today);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mportals.com";

  const { data: tenants } = await admin.from("tenants").select("id, name");
  let sent = 0;

  for (const t of (tenants ?? []) as { id: string; name: string }[]) {
    // Audience: tenant/super admins + holders of any access role granting
    // visitors:operate (security / reception / HSE).
    const [{ data: roleLinks }, { data: admins }] = await Promise.all([
      admin
        .from("profile_access_roles")
        .select("profile_id, tenant_roles!inner(tenant_id, permissions)")
        .eq("tenant_roles.tenant_id", t.id),
      admin
        .from("profiles")
        .select("id")
        .eq("tenant_id", t.id)
        .eq("is_active", true)
        .in("role", ["tenant_admin", "super_admin"]),
    ]);
    const operateIds = ((roleLinks ?? []) as Record<string, unknown>[])
      .filter((r) => {
        const tr = Array.isArray(r.tenant_roles) ? r.tenant_roles[0] : r.tenant_roles;
        const perms = (tr as { permissions?: Record<string, string[]> })?.permissions;
        return Array.isArray(perms?.visitors) && perms.visitors.includes("operate");
      })
      .map((r) => r.profile_id as string);
    const audience = [
      ...new Set([...operateIds, ...((admins ?? []) as { id: string }[]).map((a) => a.id)]),
    ];
    if (audience.length === 0) continue;

    const { data: recipients } = await admin
      .from("profiles")
      .select("email")
      .in("id", audience)
      .eq("is_active", true)
      .not("email", "is", null);
    const emails = ((recipients ?? []) as { email: string | null }[])
      .map((r) => r.email)
      .filter((e): e is string => Boolean(e));
    if (emails.length === 0) continue;

    const register = await getAccessRegister(
      { from, to, population: "all" },
      { client: admin, tenantId: t.id },
    );
    if (register.summary.total === 0) continue;

    const url = `${site}/visitors/register?from=${from}&to=${to}`;
    const html = htmlOf(register, label, url);
    const csv = Buffer.from(csvOf(register), "utf8").toString("base64");
    const results = await Promise.all(
      emails.map((toAddr) =>
        sendEmail({
          to: toAddr,
          subject: `Access Register — ${label}`,
          html,
          attachments: [{ filename: `access-register_${from}_${to}.csv`, content: csv }],
        }),
      ),
    );
    sent += results.filter(Boolean).length;
  }

  return { ok: true, sent };
}
