import "server-only";

/**
 * Minimal transactional email via Resend's HTTP API (no SDK/deps).
 * Configure with RESEND_API_KEY and EMAIL_FROM (e.g. "MyPortal <no-reply@yourdomain>").
 * No-ops cleanly when unconfigured so callers can stay best-effort.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
