"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Link2, Loader2, ShieldAlert } from "lucide-react";
import type { UserIdentity } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { GoogleIcon, MicrosoftIcon } from "@/components/provider-icons";
import { linkErrorMessage, signInMethods, type SignInMethod } from "@/lib/sign-in-methods";

function ProviderMark({ provider }: { provider: string }) {
  if (provider === "google") return <GoogleIcon />;
  if (provider === "azure") return <MicrosoftIcon />;
  return <KeyRound className="h-4 w-4 text-muted-foreground" />;
}

/**
 * The ways this account can be signed in to, and how to add another.
 *
 * Signing in with Microsoft one day and Google the next quietly produced two
 * separate accounts for one person — Supabase joins identities only when the
 * verified emails match, and a work address never matches a personal one. Both
 * halves then filled up with real work: goals under one, recognition under the
 * other, direct reports hanging off whichever was used to set them. Nothing in
 * the portal showed which door you had come in by, so there was no moment at
 * which the split was visible before it had done damage.
 */
export function SignInMethods() {
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      setError(error.message);
      setIdentities([]);
      return;
    }
    setIdentities(data?.identities ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function link(provider: string) {
    setBusy(provider);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("redirectTo", "/account");

    const { error } = await supabase.auth.linkIdentity({
      provider: provider as "google" | "azure",
      options: {
        redirectTo: callback.toString(),
        scopes: provider === "azure" ? "email profile openid" : undefined,
      },
    });

    // On success the browser leaves for the provider, so reaching here at all
    // means the flow never started.
    if (error) {
      setError(linkErrorMessage(error.message));
      setBusy(null);
    }
  }

  async function remove(method: SignInMethod) {
    const identity = identities?.find((i) => i.identity_id === method.identityId);
    if (!identity) return;
    setBusy(method.provider);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) setError(error.message);
    else setNotice(`${method.label} can no longer be used to sign in to this account.`);
    await load();
    setBusy(null);
  }

  const methods = identities ? signInMethods(identities) : [];
  const linked = methods.filter((m) => m.linked);
  const addresses = new Set(linked.map((m) => m.email).filter(Boolean));

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">How you sign in</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Every method below opens this same account. Link a second one and either will get you in —
        without it, signing in a different way creates a separate account with none of your work in
        it.
      </p>

      {identities === null ? (
        <div className="h-32 animate-pulse rounded-lg border bg-muted/30" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {methods.map((m) => (
            <li key={m.provider} className="flex flex-wrap items-center gap-3 p-3">
              <ProviderMark provider={m.provider} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.linked ? (m.email ?? "Linked to this account") : "Not linked"}
                </p>
              </div>

              {m.linked ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    <Check className="h-3 w-3" /> Linked
                  </span>
                  {m.canRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => remove(m)}
                    >
                      {busy === m.provider ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Remove"
                      )}
                    </Button>
                  )}
                </div>
              ) : m.canLink ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => link(m.provider)}
                >
                  {busy === m.provider ? "Redirecting…" : `Link ${m.label}`}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Set at sign-up</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The addresses rarely agree, and the mismatch is what splits accounts in
          the first place — so say it plainly rather than leaving two rows that
          look like two accounts. */}
      {addresses.size > 1 && (
        <p className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            These methods know you by different email addresses. That is expected once they are
            linked — they all open this one account.
          </span>
        </p>
      )}

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
