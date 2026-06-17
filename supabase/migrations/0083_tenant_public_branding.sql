-- 0083: Public tenant branding for the pre-auth login page.
--
-- Pre-login there is no user, and RLS on public.tenants won't let an anonymous
-- request read a tenant row. This SECURITY DEFINER function returns ONLY the
-- public branding fields for an exact slug (no listing/enumeration of tenants),
-- so the login page can show the workspace's name, logo and colours.

create or replace function public.tenant_public_branding(p_slug text)
returns table (name text, logo_url text, primary_color text, primary_dark text, charcoal text)
language sql stable security definer set search_path = public as $$
  select
    coalesce(nullif(t.settings -> 'branding' ->> 'name', ''), t.name),
    nullif(t.settings -> 'branding' ->> 'logoUrl', ''),
    nullif(t.settings -> 'branding' ->> 'primary', ''),
    nullif(t.settings -> 'branding' ->> 'primaryDark', ''),
    nullif(t.settings -> 'branding' ->> 'charcoal', '')
  from public.tenants t
  where t.slug = p_slug
    and t.status in ('active', 'trial')
  limit 1;
$$;

revoke all on function public.tenant_public_branding(text) from public;
grant execute on function public.tenant_public_branding(text) to anon, authenticated;
