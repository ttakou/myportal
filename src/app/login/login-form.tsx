"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthProvider = "google" | "azure";

export function LoginForm({ tenantSlug }: { tenantSlug?: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState<OAuthProvider | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  async function handleOAuth(provider: OAuthProvider) {
    setSsoLoading(provider);
    setError(null);

    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("redirectTo", redirectTo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callback.toString(),
        // Both providers need email/profile to populate the profile row.
        scopes: provider === "azure" ? "email profile openid" : undefined,
      },
    });

    // On success the browser is redirected to the provider, so we only get here
    // if initiating the flow failed.
    if (error) {
      setError(error.message);
      setSsoLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            MyEnterprisePortal
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your account
          </p>
          {tenantSlug && (
            <p className="text-xs text-muted-foreground">
              Workspace:{" "}
              <span className="font-medium text-foreground">{tenantSlug}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              or continue with
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={ssoLoading !== null}
            onClick={() => handleOAuth("azure")}
          >
            <MicrosoftIcon />
            {ssoLoading === "azure" ? "Redirecting…" : "Sign in with Microsoft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={ssoLoading !== null}
            onClick={() => handleOAuth("google")}
          >
            <GoogleIcon />
            {ssoLoading === "google" ? "Redirecting…" : "Sign in with Google"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}
