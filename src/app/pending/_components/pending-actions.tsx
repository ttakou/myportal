"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, MailQuestion, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { requestAccess } from "../actions";

export function PendingActions({ alreadyRequested }: { alreadyRequested: boolean }) {
  const router = useRouter();
  const [requested, setRequested] = useState(alreadyRequested);
  const [busy, setBusy] = useState<"request" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRequest() {
    setBusy("request");
    setError(null);
    const res = await requestAccess();
    setBusy(null);
    if (res.ok) setRequested(true);
    else setError(res.error ?? "Could not send the request.");
  }

  async function onSignOut() {
    setBusy("signout");
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {requested ? (
        <div className="flex items-center justify-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          <Check className="h-4 w-4" /> Your request has been sent to the administrators.
        </div>
      ) : (
        <Button className="w-full" onClick={onRequest} disabled={busy === "request"}>
          <MailQuestion className="h-4 w-4" />
          {busy === "request" ? "Sending…" : "Request access"}
        </Button>
      )}
      <Button variant="outline" className="w-full" onClick={onSignOut} disabled={busy === "signout"}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}
