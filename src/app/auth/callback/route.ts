import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adoptOrFlagSsoUser } from "@/lib/sso-link";

/**
 * OAuth / SSO redirect target. The provider (Google, Azure) sends the user back
 * here with a `code` which we exchange for a Supabase session. The PKCE code
 * verifier was written to a cookie by the browser client when sign-in started,
 * so the exchange works server-side.
 *
 * `/auth` is whitelisted in middleware, so this runs before the auth gate.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  // Only allow relative, same-origin redirect targets.
  const requested = searchParams.get("redirectTo") ?? "/dashboard";
  const redirectTo = requested.startsWith("/") ? requested : "/dashboard";

  // Behind a proxy (e.g. Vercel) the request origin is internal; prefer the
  // forwarded host so the final redirect lands on the public URL.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base = !isLocal && forwardedHost ? `https://${forwardedHost}` : origin;

  const fail = (message: string) =>
    NextResponse.redirect(`${base}/login?error=${encodeURIComponent(message)}`);

  if (providerError) return fail(providerError);
  if (!code) return fail("Sign-in was cancelled or no authorization code was returned.");

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  // First SSO sign-in for an already-registered employee can land as a fresh
  // tenant-less account. Reconcile it against any existing org account with the
  // same email so they don't show up as a duplicate "new user". Best-effort —
  // never block sign-in on this.
  const user = data?.user;
  if (user) {
    try {
      await adoptOrFlagSsoUser(user.id, user.email ?? null);
    } catch (e) {
      console.error("sso-link:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.redirect(`${base}${redirectTo}`);
}
