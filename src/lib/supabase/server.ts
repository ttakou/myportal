import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";

// `cache` de-dupes per request in the Next runtime; degrade to a pass-through
// where it isn't available (e.g. unit tests), so the module still loads.
const memo: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof cache === "function" ? cache : (fn) => fn;

type CookieToSet = { name: string; value: string; options: CookieOptions };

function buildClient() {
  const cookieStore = (cookies() as unknown as UnsafeUnwrappedCookies);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component. Safe to ignore when
            // middleware is responsible for refreshing the session cookie.
          }
        },
      },
    },
  );
}

/**
 * Verify the current session's JWT against Supabase Auth — **once per request**.
 * Every `createClient()` in a request builds its own client, and each direct
 * `supabase.auth.getUser()` used to be a separate network call to the Auth API;
 * a data-heavy page firing dozens in parallel could trip the Auth rate limit
 * (429). React's `cache()` de-duplicates them to a single verification per
 * request (the cookies — hence the user — are identical across the request).
 */
const requestGetUser = memo(async () => buildClient().auth.getUser());

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Reads/writes the auth cookies via Next's cookie store. Every query made with
 * this client runs as the logged-in user, so RLS enforces tenant isolation.
 *
 * The zero-arg `auth.getUser()` is transparently memoised per request (see
 * above); passing an explicit JWT still goes straight through.
 */
export function createClient() {
  const client = buildClient();
  const original = client.auth.getUser.bind(client.auth);
  const getUser: typeof client.auth.getUser = (jwt?: string) =>
    jwt === undefined ? requestGetUser() : original(jwt);
  (client.auth as { getUser: typeof client.auth.getUser }).getUser = getUser;
  return client;
}
