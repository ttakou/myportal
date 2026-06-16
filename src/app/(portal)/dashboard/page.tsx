import Link from "next/link";
import {
  LifeBuoy,
  Ship,
  BedDouble,
  Users,
  Anchor,
  Siren,
  ArrowRight,
  UtensilsCrossed,
  Car,
  UserPlus,
} from "lucide-react";
import { getActiveServices } from "@/lib/services";
import { getMyDashboard } from "@/lib/dashboard";
import { getMenu, today } from "@/lib/canteen";
import { MEAL_PERIODS, MEAL_PERIOD_LABEL } from "@/types/canteen";

/** Services an onshore user's dashboard leads with, in priority order. */
const FOCUS_SLUGS = ["emergency", "canteen", "transportation", "visitors"];

function focusIcon(slug: string) {
  switch (slug) {
    case "emergency":
      return <Siren className="h-5 w-5" />;
    case "canteen":
      return <UtensilsCrossed className="h-5 w-5" />;
    case "transportation":
      return <Car className="h-5 w-5" />;
    case "visitors":
      return <UserPlus className="h-5 w-5" />;
    default:
      return <ArrowRight className="h-5 w-5" />;
  }
}

export default async function DashboardPage() {
  const [services, me] = await Promise.all([getActiveServices(), getMyDashboard()]);

  const firstName = me?.name?.split(/\s+/)[0] ?? "";
  const offshore = me?.offshore ?? null;
  const approvals = me?.approvals ?? [];
  const myRequests = me?.myRequests ?? [];
  const quickLinks = me?.quickLinks ?? [];

  // Onshore users (no offshore profile/trip) lead with the four key services;
  // the remaining modules drop below under "More modules".
  const isOffshore = Boolean(offshore);
  const focusServices = isOffshore
    ? []
    : FOCUS_SLUGS.map((slug) => services.find((s) => s.slug === slug)).filter(
        (s): s is NonNullable<typeof s> => Boolean(s),
      );
  const focusIds = new Set(focusServices.map((s) => s.id));
  const otherServices = services.filter((s) => !focusIds.has(s.id));

  // Onshore staff lead with today's canteen menu (when the module is on for them).
  const canteenActive = services.some((s) => s.slug === "canteen");
  const menu = !isOffshore && canteenActive ? await getMenu(today()) : [];
  const menuPeriods = MEAL_PERIODS.filter((p) => menu.some((d) => d.meal_period === p));
  const menuDateLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        </h1>
        <p className="text-muted-foreground">Your day at a glance.</p>
      </div>

      {/* Offshore personalization */}
      {offshore && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Anchor className="h-5 w-5 text-brand" /> My offshore
          </h2>
          <div className="rounded-lg border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  icon={<Ship className="h-4 w-4" />}
                  label="Rotation"
                  value={
                    offshore.trip
                      ? `${offshore.trip.installation ?? "—"}`
                      : "No trip scheduled"
                  }
                  sub={
                    offshore.trip
                      ? `${offshore.trip.mobilize}${offshore.trip.demob ? ` → ${offshore.trip.demob}` : ""} · ${offshore.trip.statusLabel}`
                      : undefined
                  }
                />
                <Stat
                  icon={<LifeBuoy className="h-4 w-4" />}
                  label="Muster station"
                  value={offshore.station ?? "Not assigned"}
                />
                <Stat
                  icon={<BedDouble className="h-4 w-4" />}
                  label="Cabin / bed"
                  value={[offshore.room, offshore.bed && `Bed ${offshore.bed}`].filter(Boolean).join(" · ") || "Not assigned"}
                />
                <Stat
                  icon={<Users className="h-4 w-4" />}
                  label="Crew"
                  value={offshore.crew ?? "—"}
                />
              </div>
              <Link
                href="/emergency"
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                <Siren className="h-4 w-4" /> Emergency support
              </Link>
            </div>
            {offshore.trip?.active && (
              <p className="mt-3 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800">
                You are currently mobilised offshore.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Onshore quick access — lead with the key everyday services */}
      {focusServices.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Quick access</h2>
            <p className="text-sm text-muted-foreground">Your most-used services.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {focusServices.map((s) => (
              <a
                key={s.id}
                href={s.route_path}
                className="flex flex-col gap-2 rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {focusIcon(s.slug)}
                </span>
                <h3 className="font-medium">{s.name}</h3>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Action strips */}
      {(approvals.length > 0 || myRequests.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {approvals.length > 0 && (
            <CountList title="Awaiting your approval" items={approvals} accent />
          )}
          {myRequests.length > 0 && <CountList title="My open requests" items={myRequests} />}
        </div>
      )}

      {/* Quick actions */}
      {quickLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((q) => (
            <Link
              key={q.href + q.label}
              href={q.href}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              {q.label} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      )}

      {/* Today's canteen menu — onshore staff */}
      {!isOffshore && canteenActive && (
        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UtensilsCrossed className="h-5 w-5 text-brand" /> Today&apos;s canteen menu
            </h2>
            <p className="text-sm text-muted-foreground">{menuDateLabel}</p>
          </div>
          {menuPeriods.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Today&apos;s menu hasn&apos;t been published yet.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {menuPeriods.map((period) => (
                <div key={period} className="rounded-lg border bg-card p-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {MEAL_PERIOD_LABEL[period]}
                  </h3>
                  <ul className="space-y-2">
                    {menu
                      .filter((d) => d.meal_period === period)
                      .map((d) => (
                        <li key={d.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{d.name}</span>
                            {d.kitchen_name && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {d.kitchen_name}
                              </span>
                            )}
                            {!d.available && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Sold out
                              </span>
                            )}
                          </div>
                          {d.description && (
                            <p className="text-xs text-muted-foreground">{d.description}</p>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/canteen"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Book your meal <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Modules — offshore keeps the full grid; onshore is intentionally focused */}
      {isOffshore &&
        (services.length === 0 ? (
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Modules</h2>
              <p className="text-sm text-muted-foreground">
                Everything your organization has access to.
              </p>
            </div>
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              No modules are currently enabled for your organization. Contact your administrator.
            </p>
          </section>
        ) : (
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Modules</h2>
              <p className="text-sm text-muted-foreground">
                Everything your organization has access to.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherServices.map((s) => (
                <a
                  key={s.id}
                  href={s.route_path}
                  className="rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
                >
                  <h3 className="font-medium">{s.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                </a>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CountList({
  title,
  items,
  accent = false,
}: {
  title: string;
  items: { label: string; href: string; count: number }[];
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2 text-sm font-semibold">{title}</div>
      <ul className="divide-y">
        {items.map((it) => (
          <li key={it.href + it.label}>
            <Link
              href={it.href}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent"
            >
              <span>{it.label}</span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs font-semibold " +
                  (accent ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary")
                }
              >
                {it.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
