# MyEnterprisePortal

A modular, multi-tenant **Employee Self-Service (ESS) portal** for enterprise
companies. The application is fully **data-driven**: the database dictates which
UI modules, sidebar links, and routes a user can access based on their company's
(tenant's) subscription.

## Sprint 1 — Multi-Tenant Foundation

This sprint delivers the core infrastructure only (no operational modules yet):

- **Database schema**: `tenants`, `profiles`, `services_catalog`, `tenant_services`.
- **Row Level Security**: total tenant isolation driven by JWT claims.
- **Dynamic Sidebar**: renders only the modules a tenant is subscribed to.
- **Route Middleware**: blocks manual URL access to unsubscribed modules.

## Tech stack

- Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui conventions
- Supabase (PostgreSQL · Auth · Row Level Security · Realtime)

## Architecture

```
Request ─► Middleware ──► (auth gate) ──► (module subscription gate) ──► Page
              │                                   │
              │  reads tenant_services (RLS)      │  redirects to /access-denied
              ▼                                   ▼
        Supabase session                    Server Components + Sidebar
                                            also read tenant_services (RLS)
```

Three independent enforcement layers:

1. **RLS (database):** every query runs as the user; cross-tenant rows are
   invisible even if app code is buggy. Tenant + role come from **signed JWT
   claims** (no table lookups → no recursion, near-zero cost).
2. **Middleware (edge):** blocks unsubscribed module URLs before any render.
3. **Sidebar / pages (server):** never display links the tenant lacks.

`src/lib/navigation.ts` is the single source of truth mapping module slugs to
route prefixes; both the sidebar and middleware consume it so they cannot drift.

## Folder structure

```
myportal/
├── supabase/
│   └── migrations/
│       ├── 0001_core_schema.sql      # tables + seed of the 9 modules
│       └── 0002_rls_policies.sql     # access-token hook + RLS policies
├── src/
│   ├── middleware.ts                 # auth + module-subscription route guard
│   ├── app/
│   │   ├── layout.tsx                # root layout
│   │   ├── globals.css
│   │   ├── page.tsx                  # → redirects to /dashboard
│   │   ├── login/page.tsx            # email/password sign-in
│   │   ├── access-denied/page.tsx    # shown for unsubscribed modules
│   │   └── (portal)/                 # route group: authed pages + sidebar
│   │       ├── layout.tsx            # sidebar + auth check
│   │       └── dashboard/page.tsx
│   ├── components/
│   │   ├── ui/button.tsx
│   │   └── layout/
│   │       ├── sidebar.tsx           # data-driven (Server Component)
│   │       └── nav-links.tsx         # active-link highlighting (Client)
│   ├── lib/
│   │   ├── navigation.ts             # slug ⇄ route map (shared)
│   │   ├── services.ts               # fetch active tenant modules
│   │   ├── utils.ts                  # cn()
│   │   └── supabase/{client,server,middleware}.ts
│   └── types/database.ts
└── .env.example
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env.local` and fill in
   your Supabase project URL and keys.

3. **Apply migrations** (Supabase CLI or paste into the SQL editor in order):

   ```bash
   supabase db push   # or run 0001_*.sql then 0002_*.sql
   ```

4. **Enable the Custom Access Token Hook** (required for RLS to work).
   This step cannot be done in SQL:

   - **Hosted:** Dashboard → Authentication → Hooks → *Customize Access Token
     (JWT) Claims* → enable, select `public.custom_access_token_hook`.
   - **Local:** add to `supabase/config.toml`:

     ```toml
     [auth.hook.custom_access_token]
     enabled = true
     uri = "pg-functions://postgres/public/custom_access_token_hook"
     ```

   After enabling, users must re-authenticate so their JWT carries the new
   `app_metadata.tenant_id` / `app_metadata.user_role` claims.

5. **Run**

   ```bash
   npm run dev
   ```

## Onboarding a tenant (until an admin UI exists)

```sql
-- 1. Create the tenant
insert into tenants (name, slug, status) values ('Acme Oil', 'acme-oil', 'active');

-- 2. Assign a user to it (after they sign up) and make them an admin
update profiles set tenant_id = '<tenant-uuid>', role = 'tenant_admin'
where email = 'admin@acme-oil.com';

-- 3. Subscribe the tenant to some modules
insert into tenant_services (tenant_id, service_id)
select '<tenant-uuid>', id from services_catalog where slug in ('canteen', 'transportation');
```
