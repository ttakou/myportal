create extension if not exists pg_cron;

create or replace function public.notify_cert_expiry() returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (tenant_id, profile_id, category, title, body, url)
  select s.tenant_id, recip.id, 'general',
    'Cert expiring: ' || coalesce(p.full_name, p.email, 'crew'),
    cert.kind || ' ' ||
      case when cert.exp < current_date then 'expired ' else 'expires ' end || cert.exp::text,
    '/offshore#cert-' || s.profile_id || '-' || cert.kind || '-' || cert.exp::text
  from public.offshore_staff s
  join public.profiles p on p.id = s.profile_id
  cross join lateral (values
    ('Medical', s.medical_expiry),
    ('BOSIET', s.bosiet_expiry),
    ('HUET', s.huet_expiry)
  ) as cert(kind, exp)
  join public.profiles recip on recip.tenant_id = s.tenant_id
    and (recip.role in ('tenant_admin','super_admin')
         or exists (select 1 from public.profile_roles pr
                    where pr.profile_id = recip.id and pr.role = 'safety_admin'))
  where cert.exp is not null
    and cert.exp <= current_date + 30
    and cert.exp >= current_date - 1
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = recip.id
        and n.url = '/offshore#cert-' || s.profile_id || '-' || cert.kind || '-' || cert.exp::text
    );
$$;

select cron.schedule('cert-expiry-daily', '0 6 * * *', $$ select public.notify_cert_expiry(); $$);
