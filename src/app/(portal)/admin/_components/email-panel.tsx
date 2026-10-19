"use client";

import { useState } from "react";
import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { sendTestEmail } from "../actions";

/**
 * The email channel: whether it is switched on, who mail comes from, how
 * often people get it, and a test button. The key itself is never shown.
 */
export function EmailPanel({ status }: { status: { configured: boolean; hasKey: boolean; from: string | null } }) {
  const [pending, startTransition] = useStatusTransition("Sending…");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const test = () => {
    setResult(null);
    startTransition(async () => {
      const res = await sendTestEmail();
      setResult(res.ok ? { ok: true, text: `Sent to ${res.to}. Check that inbox (and its spam folder).` } : { ok: false, text: res.error ?? "Could not send." });
    });
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Mail className="h-5 w-5 text-primary" /> Email notifications
      </h2>
      <div className="mt-3 space-y-1.5 text-sm">
        <p className="flex items-center gap-1.5">
          {status.configured ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
          {status.configured ? "Switched on." : "Not switched on yet."}
        </p>
        <p className="text-muted-foreground">
          Sender: <span className="font-medium text-foreground">{status.from ?? "not set (EMAIL_FROM)"}</span>
          {" · "}API key: <span className="font-medium text-foreground">{status.hasKey ? "set" : "not set (RESEND_API_KEY)"}</span>
        </p>
        <p className="text-muted-foreground">
          Everyone gets at most one email a day, at 07:00 site time, listing their notifications since the day before; repeats
          of the same alert show once with a count. Each person chooses which kinds are emailed under Account › Notifications.
        </p>
        {!status.configured && (
          <p className="text-muted-foreground">
            To switch it on, add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to the project&apos;s environment
            variables and redeploy.
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending || !status.configured} onClick={test}>
          Send me a test email
        </Button>
        {result && <span className={result.ok ? "text-sm text-green-700" : "text-sm text-destructive"}>{result.text}</span>}
      </div>
    </section>
  );
}
