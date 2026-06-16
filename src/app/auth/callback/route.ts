import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  return NextResponse.redirect(`${base}${redirectTo}`);
}
