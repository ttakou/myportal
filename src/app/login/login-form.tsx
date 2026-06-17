"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  HeartPulse,
  PiggyBank,
  Plane,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthProvider = "google" | "azure";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80";

const FEATURES = [
  { icon: UtensilsCrossed, label: "Canteen & meals" },
  { icon: Plane, label: "Travel & trips" },
  { icon: HeartPulse, label: "Medical records" },
  { icon: PiggyBank, label: "Savings & payroll" },
  { icon: CalendarCheck, label: "Performance" },
  { icon: ShieldCheck, label: "HSE & offshore" },
];

export function LoginForm({
  tenantSlug,
  brandName,
  logoUrl,
  cssVars,
}: {
  tenantSlug?: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
  cssVars?: React.CSSProperties;
}) {
  const router = useRouter();
  const displayName = brandName ?? "MyEnterprisePortal";
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
    <div className="min-h-screen lg:grid lg:grid-cols-2" style={cssVars}>
      <HeroPanel brandName={displayName} />

      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
        <MobileBrand brandName={displayName} />

        <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
          <div className="space-y-1 text-center">
            {logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={displayName}
                  className="mx-auto mb-1 h-10 w-auto object-contain"
                />
                <h1 className="sr-only">{displayName}</h1>
              </>
            ) : (
              <h1 className="text-xl font-semibold tracking-tight">{displayName}</h1>
            )}
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
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
    </div>
  );
}

/**
 * Compact branded banner shown ABOVE the sign-in card on small screens, where
 * the full-height HeroPanel is hidden. Keeps the redesign visible on mobile.
 */
function MobileBrand({ brandName }: { brandName: string }) {
  return (
    <div className="w-full max-w-sm lg:hidden">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-rose-900 p-6 text-center text-white shadow-sm">
        {/* Photo behind a legibility gradient; gradient shows if it fails. */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/45 to-slate-900/20"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            {brandName}
          </p>
          <h2 className="mt-2 text-lg font-semibold leading-snug">
            Everything your team needs, in one portal.
          </h2>
          <ul className="mt-4 grid grid-cols-3 gap-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/10 px-2 py-2 text-[11px] font-medium backdrop-blur-sm"
              >
                <Icon className="h-4 w-4 text-white/90" />
                <span className="leading-tight">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Branded marketing panel shown beside the sign-in card on large screens. */
function HeroPanel({ brandName }: { brandName: string }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-rose-900 p-12 text-white lg:flex">
      {/* Photo + legibility overlay; gradient shows through / as fallback. */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent"
        aria-hidden
      />

      <p className="relative text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
        {brandName}
      </p>

      <div className="relative space-y-6">
        <h2 className="max-w-md text-3xl font-semibold leading-tight">
          Everything your team needs, in one self-service portal.
        </h2>
        <p className="max-w-md text-white/80">
          Book meals, request trips, manage medicals, track savings and clear
          HSE — all from a single sign-in.
        </p>
        <ul className="grid max-w-md grid-cols-2 gap-3">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium backdrop-blur-sm"
            >
              <Icon className="h-4 w-4 shrink-0 text-white/80" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/50">
        Secure single sign-on with Microsoft &amp; Google.
      </p>
    </aside>
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
