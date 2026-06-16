import Link from "next/link";
import {
  LifeBuoy,
  Ship,
  BedDouble,
  Users,
  Anchor,
  Siren,
  ArrowRight,
} from "lucide-react";
import { getActiveServices } from "@/lib/services";
import { getMyDashboard } from "@/lib/dashboard";

export default async function DashboardPage() {
  const [services, me] = await Promise.all([getActiveServices(), getMyDashboard()]);

  const firstName = me?.name?.split(/\s+/)[0] ?? "";
  const offshore = me?.offshore ?? null;
  const approvals = me?.approvals ?? [];
  const myRequests = me?.myRequests ?? [];
  const quickLinks = me?.quickLinks ?? [];

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

      {/* Modules */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Modules</h2>
          <p className="text-sm text-muted-foreground">Everything your organization has access to.</p>
        </div>
        {services.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            No modules are currently enabled for your organization. Contact your administrator.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
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
        )}
      </section>
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
