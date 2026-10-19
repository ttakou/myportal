import "server-only";

/**
 * Minimal transactional email via Resend's HTTP API (no SDK/deps).
 * Configure with RESEND_API_KEY; EMAIL_FROM optionally overrides the sender.
 * No-ops cleanly when unconfigured so callers can stay best-effort.
 */
/** The sender: EMAIL_FROM when set, else the portal's own verified domain. */
const DEFAULT_FROM = "MyPortal <no-reply@mportals.com>";

function sender(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** What the admin console shows about the email channel. Never the key itself. */
export function emailStatus(): { configured: boolean; hasKey: boolean; from: string | null } {
  return {
    configured: isEmailConfigured(),
    hasKey: Boolean(process.env.RESEND_API_KEY),
    from: sender(),
  };
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional file attachments (content base64-encoded, per the Resend API). */
  attachments?: { filename: string; content: string }[];
}

/** Send one email and say why it failed, for the admin's test button. */
export async function sendEmailDetailed(input: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "Email is not configured: RESEND_API_KEY is not set (add it in Vercel and redeploy)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments,
      }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { message?: string; name?: string } | null;
    return { ok: false, error: `Resend refused it (${res.status})${body?.message ? `: ${body.message}` : ""}` };
  } catch (e) {
    return { ok: false, error: `Could not reach Resend: ${(e as Error).message}` };
  }
}

export async function sendEmail(input: EmailMessage): Promise<boolean> {
  return (await sendEmailDetailed(input)).ok;
}

/**
 * Send up to 100 emails in one call (Resend's batch endpoint), so a morning
 * digest to everyone stays inside the API's per-second request limit.
 * Returns whether the batch was accepted; attachments are not supported here.
 */
export async function sendEmailBatch(messages: EmailMessage[]): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "Email is not configured." };
  if (messages.length === 0) return { ok: true };
  if (messages.length > 100) return { ok: false, error: "A batch holds at most 100 emails." };
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        messages.map((m) => ({ from: sender(), to: [m.to], subject: m.subject, html: m.html, text: m.text })),
      ),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: `Resend refused the batch (${res.status})${body?.message ? `: ${body.message}` : ""}` };
  } catch (e) {
    return { ok: false, error: `Could not reach Resend: ${(e as Error).message}` };
  }
}
