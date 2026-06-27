import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import {
  ALWAYS_ALLOWED_PREFIXES,
  matchModuleRoute,
} from "@/lib/navigation";

const PUBLIC_PATHS = ["/login", "/auth", "/_next", "/favicon.ico", "/verify"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always refresh the session so server components see a valid token.
  const { supabase, supabaseResponse } = createMiddlewareClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Impersonation auto-expiry ---------------------------------------------
  // If an impersonation window has elapsed, restore the admin's own session and
  // clear the impersonation cookies before doing anything else.
  const impExp = request.cookies.get("imp_exp")?.value;
  if (user && impExp && Number(impExp) < Date.now()) {
    const rt = request.cookies.get("imp_admin_rt")?.value;
    if (rt) {
      try {
        await supabase.auth.refreshSession({ refresh_token: rt });
      } catch {
        /* fall through and clear cookies regardless */
      }
    }
    const back = request.nextUrl.clone();
    back.pathname = "/admin";
    back.search = "";
    const redirect = NextResponse.redirect(back);
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
    for (const name of ["imp_admin_rt", "imp_active", "imp_actor", "imp_exp"]) {
      redirect.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
    return redirect;
  }

  // ---- 1. Authentication gate -------------------------------------------------
  if (!user) {
    if (isPublic(pathname) || pathname === "/") {
      return supabaseResponse;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ---- 1b. Pending (tenant-less) gate -----------------------------------------
  // A first sign-in (incl. SSO) creates a profile with no tenant. Such a user
  // can't use any module, so route them to a clear "awaiting access" screen
  // instead of bouncing through access-denied pages. Skip on public/asset/API
  // paths so the pending page itself can load its CSS/JS and APIs don't get an
  // HTML redirect.
  const onPending = pathname === "/pending";
  if (!isPublic(pathname) && !pathname.startsWith("/api/") && pathname !== "/api") {
    // The access-token hook stamps tenant_id into the JWT for onboarded users;
    // when it's present we can skip the DB read entirely.
    const claimTenant = (user.app_metadata as { tenant_id?: string } | undefined)?.tenant_id;
    let tenantless = false;
    if (!claimTenant) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("tenant_id, role")
        .eq("id", user.id)
        .maybeSingle();
      tenantless = !!prof && prof.tenant_id == null && prof.role !== "super_admin";
    }
    if (tenantless && !onPending) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending";
      url.search = "";
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
      return redirect;
    }
    if (!tenantless && onPending) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
      return redirect;
    }
  }

  // Authenticated users hitting public/neutral paths pass straight through.
  if (
    isPublic(pathname) ||
    pathname === "/" ||
    ALWAYS_ALLOWED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    return supabaseResponse;
  }

  // ---- 2. Module subscription gate -------------------------------------------
  const matched = matchModuleRoute(pathname);

  // Not a module-gated path → allow (other auth'd app routes).
  if (!matched) {
    return supabaseResponse;
  }

  // Core modules (e.g. /admin) are always available to authenticated tenants.
  if (matched.isCore) {
    return supabaseResponse;
  }

  // Check the tenant's active subscriptions. RLS scopes this to the user's
  // tenant, so we only ever see our own rows.
  const [{ data, error }, { data: myRoles }] = await Promise.all([
    supabase
      .from("tenant_services")
      .select("services_catalog!inner(slug)")
      .eq("is_active", true)
      .eq("services_catalog.slug", matched.slug)
      .maybeSingle(),
    // ---- 3. Role gate (strict allowlist): a module is reachable only when one
    // of the user's assigned access roles grants its slug. No roles => denied.
    supabase
      .from("profile_access_roles")
      .select("tenant_roles(module_slugs)")
      .eq("profile_id", user.id),
  ]);

  const roleAllowed = (myRoles ?? []).some((row) => {
    const role = Array.isArray(row.tenant_roles) ? row.tenant_roles[0] : row.tenant_roles;
    return ((role?.module_slugs as string[]) ?? []).includes(matched.slug);
  });

  if (error || !data || !roleAllowed) {
    const denied = request.nextUrl.clone();
    denied.pathname = "/access-denied";
    denied.searchParams.set("module", matched.slug);
    // Preserve refreshed auth cookies on the redirect response.
    const redirect = NextResponse.redirect(denied);
    supabaseResponse.cookies.getAll().forEach((c) =>
      redirect.cookies.set(c.name, c.value),
    );
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  // Run on everything except static assets / images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
