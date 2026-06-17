import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Reads/writes the auth cookies via Next's cookie store. Every query made with
 * this client runs as the logged-in user, so RLS enforces tenant isolation.
 */
export function createClient() {
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
