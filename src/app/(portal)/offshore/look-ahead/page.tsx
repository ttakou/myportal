import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw, ShieldX, Telescope } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getPobBreakdown } from "@/lib/offshore";
import { getLookAhead, type LookAheadDay } from "@/lib/offshore/look-ahead";
import { siteDate } from "@/lib/visitors/daily";
import type { BedStatus } from "@/lib/offshore/look-ahead-plan";
import { tenantId } from "../_actions/_shared";

/**
 * Look-ahead: what the coming crew changes need before they happen — POB
 * against the limit, beds, arrivals and departures, manifests, and what to
 * settle first. For the OIM and the Campboss (the Dispatcher reads it too).
 */

const STATUS: Record<BedStatus, { label: string; tone: string }> = {
  own: { label: "own cabin", tone: "bg-green-100 text-green-800" },
  swap: { label: "swap", tone: "bg-blue-100 text-blue-800" },
  suggest: { label: "suggested", tone: "bg-amber-100 text-amber-900" },
  conflict: { label: "conflict", tone: "bg-destructive/10 text-destructive" },
  none: { label: "no bed", tone: "bg-destructive/10 text-destructive" },
};

const shortDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function LookAheadPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; inst?: string; day?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isAdmin || access.isOim || access.isCampboss || access.isDispatcher)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">The Look-ahead is for the OIM, the Campboss and the offshore desk.</p>
      </div>
    );
  }
  const sp = await searchParams;
  const span = sp.days === "28" ? 28 : 14;
  const tenant = await tenantId();
  if (!tenant) return <p className="p-8 text-sm text-muted-foreground">No organisation in scope.</p>;
  const today = siteDate(new Date().toISOString());

  const [la, pob] = await Promise.all([
    getLookAhead({ client: createClient(), tenantId: tenant, from: today, days: span, installationId: sp.inst ?? null, selectedDate: sp.day ?? null }),
    getPobBreakdown(),
  ]);
  const unscheduled = pob.people.filter((p) => p.schedule_state === "unscheduled").length;

  const href = (p: { days?: number; inst?: string | null; day?: string | null }) => {
    const q = new URLSearchParams();
    const d = p.days ?? span;
    if (d !== 14) q.set("days", String(d));
    const inst = p.inst === undefined ? sp.inst : p.inst;
    if (inst) q.set("inst", inst);
    const day = p.day === undefined ? la.selected?.date : p.day;
    if (day) q.set("day", day);
    const s = q.toString();
    return `/offshore/look-ahead${s ? `?${s}` : ""}`;
  };
  const sel = la.selected;
  const selDay = la.days.find((d) => d.date === sel?.date) ?? null;
  const cap = la.installation?.capacity ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/offshore?view=dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Offshore
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Telescope className="h-6 w-6 text-primary" /> Look-ahead
          </h1>
          <p className="text-sm text-muted-foreground">What the next crew changes need, before they happen — for the OIM and the Campboss.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {shortDate(today)} · POB limit {cap || "—"} · {la.usableBeds} usable beds
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border text-sm font-medium">
          {[14, 28].map((d) => (
            <Link key={d} href={href({ days: d, day: null })} className={cn("px-3 py-1.5", span === d ? "bg-foreground text-background" : "hover:bg-accent")}>
              {d} days
            </Link>
          ))}
        </div>
        {la.installations.length > 1 &&
          la.installations.map((i) => (
            <Link
              key={i.id}
              href={href({ inst: i.id, day: null })}
              className={cn("rounded-md border px-3 py-1.5 text-sm font-medium", la.installation?.id === i.id ? "border-foreground" : "hover:bg-accent")}
            >
              {i.name}
            </Link>
          ))}
        <Link href={href({})} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi value={la.kpis.overDays} label="day(s) over the POB limit (if pending approved)" tone={la.kpis.overDays ? "red" : undefined} />
        <Kpi value={la.kpis.shortDays} label="day(s) short of beds" tone={la.kpis.shortDays ? "red" : undefined} />
        <Kpi value={la.kpis.pending} label="decision(s) pending on these dates" tone={la.kpis.pending ? "amber" : undefined} />
        <Kpi value={la.kpis.crewChanges} label="crew change day(s) ahead" />
        <Kpi value={la.kpis.peak} label={`peak POB confirmed${la.kpis.peakDate ? ` (${shortDate(la.kpis.peakDate)})` : ""}`} tone={cap && la.kpis.peak > cap ? "red" : "green"} />
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[980px] gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
          {la.days.map((d) => (
            <DayCard key={d.date} d={d} selected={d.date === sel?.date} href={href({ day: d.date })} />
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        ▲ arrivals (MOB) · ▼ departures (DEMOB) · dark border = crew change day · ⚠ needs action · bar = POB against the limit ·
        beds free = usable beds − POB. Click a day for its detail.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="space-y-3 rounded-lg border bg-card p-4">
          {sel && selDay ? (
            <>
              <div>
                <h2 className="font-semibold">
                  {selDay.weekday} {shortDate(sel.date)}
                  {selDay.crewChange &&
                    ` — crew change${selDay.crewsOut.length ? ` (${selDay.crewsOut.join(" & ")} in` : " ("}${selDay.crewsIn.length ? `${selDay.crewsOut.length ? " · " : ""}${selDay.crewsIn.join(" & ")} out` : ""})`}
                </h2>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {(["out", "in"] as const).map((dir) => {
                    const m = sel.manifests.find((x) => x.direction === dir);
                    return (
                      <span key={dir}>
                        {dir === "out" ? "MOB" : "DEMOB"} manifest:{" "}
                        {m ? (
                          <Link
                            href={`/offshore-manifest/${m.id}`}
                            className={cn("rounded px-1.5 py-0.5 font-medium", m.status === "draft" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800")}
                          >
                            {m.status} · {m.pax} pax{m.transport ? ` · ${m.transport}` : ""}
                          </Link>
                        ) : (
                          <span className="rounded bg-muted px-1.5 py-0.5">none yet</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arriving ({sel.arrivals.length}) — bed plan</h3>
                {sel.arrivals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody arrives.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Name</th>
                          <th className="px-2 py-1.5 font-medium">Crew</th>
                          <th className="px-2 py-1.5 font-medium">Bed plan</th>
                          <th className="px-2 py-1.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {sel.arrivals.map((a) => (
                          <tr key={a.key} className="align-top">
                            <td className="px-2 py-1.5">{a.name}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{a.crew ?? "—"}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {a.status === "own" && `${a.room} (own cabin)`}
                              {a.status === "swap" && `${a.room} — freed by a departure that day`}
                              {a.status === "suggest" && `No cabin — suggest ${a.room}`}
                              {a.status === "conflict" && (
                                <>
                                  {a.cabin} full ({a.blockers.join(", ")})
                                  {a.room ? ` — suggest ${a.room}` : " — no other bed free"}
                                </>
                              )}
                              {a.status === "none" && "No free bed anywhere"}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS[a.status].tone)}>{STATUS[a.status].label}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leaving ({sel.departures.length})</h3>
                <p className="text-sm text-muted-foreground">
                  {sel.departures.length === 0 ? "Nobody leaves." : sel.departures.map((d) => d.name).join(" · ")}
                </p>
              </div>

              {sel.pending.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Waiting for a decision</h3>
                  <ul className="text-sm text-muted-foreground">
                    {sel.pending.map((p, i) => (
                      <li key={i}>
                        {p.what}: <span className="text-foreground">{p.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No crew change or arrival in this period.</p>
          )}
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">To do before the next crew changes</h2>
          <ul className="space-y-2.5">
            <Todo
              n={la.todo.noBed.count}
              tone="red"
              title="Arrivals with no bed"
              note={la.todo.noBed.dates.length ? `on ${la.todo.noBed.dates.map(shortDate).join(", ")}` : undefined}
              href="/offshore?view=bedboard"
              link="Open bed board"
            />
            <Todo
              n={la.todo.overstayerBlocks.count}
              tone="red"
              title="Overstayer blocking a cabin"
              note={la.todo.overstayerBlocks.cabins.length ? `needed by an arrival (${la.todo.overstayerBlocks.cabins.join(", ")})` : undefined}
              href="/offshore?view=dashboard"
              link="Review overstayers"
            />
            <Todo
              n={la.todo.pending}
              tone="amber"
              title="Pending decisions on these dates"
              note={la.todo.pendingOverDates.length ? `${la.todo.pendingOverDates.map(shortDate).join(", ")} go(es) over the limit if all approved` : undefined}
              href="/offshore?view=requests"
              link="Trip Requests"
            />
            <Todo
              n={la.todo.draftManifests.count}
              tone="amber"
              title="Manifests still draft in the next week"
              note={la.todo.draftManifests.dates.length ? `for ${la.todo.draftManifests.dates.map(shortDate).join(", ")}` : undefined}
              href="/offshore?view=manifests"
              link="Manifests"
            />
            <Todo n={la.todo.noRoom} title="On board with no room" href="/offshore?view=bedboard" link="Show list" />
            <Todo n={la.todo.openEnded} title="Open-ended trips (on board, no demob date)" href="/offshore?view=dashboard" link="Show list" />
            <Todo n={la.todo.overstaying} title="Overstaying (past their demob date)" href="/offshore?view=dashboard" link="Show list" />
            <Todo n={unscheduled} title="Unscheduled on board (not on their crew's rotation)" href="/offshore?view=dashboard" link="Show list" />
          </ul>
          <p className="text-xs text-muted-foreground">A summary of the next 14 days goes to the OIM and the Campboss every Monday.</p>
        </section>
      </div>

      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Catering forecast (meals per day)</h2>
        <p className="text-xs text-muted-foreground">From the POB above (confirmed people), for supply orders.</p>
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] gap-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
            {la.days.map((d) => (
              <div key={d.date} className={cn("rounded border px-1 py-1 text-center text-[11px]", d.over && "border-destructive/50")}>
                <span className="text-muted-foreground">{shortDate(d.date)}</span>
                <b className="block text-sm tabular-nums">{d.total}</b>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function DayCard({ d, selected, href }: { d: LookAheadDay; selected: boolean; href: string }) {
  const pct = d.capacity > 0 ? Math.min(100, Math.round((d.total / d.capacity) * 100)) : 0;
  return (
    <Link
      href={href}
      className={cn(
        "relative rounded-lg border p-1.5 text-center text-[11px] transition-colors hover:bg-accent",
        d.crewChange && "border-foreground",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
    >
      {d.flagged && <AlertTriangle className="absolute right-1 top-1 h-3 w-3 text-destructive" />}
      <div className="font-semibold">{shortDate(d.date)}</div>
      <div className="text-[10px] text-muted-foreground">{d.weekday}</div>
      <div className={cn("mt-1 text-base font-semibold tabular-nums", d.over && "text-destructive")}>{d.total}</div>
      <div className="text-[10px] text-muted-foreground">
        /{d.capacity || "—"}
        {d.pending > 0 && d.overIfApproved && !d.over ? ` · ${d.total + d.pending} if approved` : ""}
      </div>
      <div className="my-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", d.over || d.overIfApproved ? "bg-destructive" : "bg-green-500")} style={{ width: `${pct}%` }} />
      </div>
      {d.bedsFree === null ? (
        <div className="rounded bg-muted px-0.5 text-[10px] text-muted-foreground">contractor beds</div>
      ) : (
        <div className={cn("rounded px-0.5 text-[10px]", d.bedsFree < 0 ? "bg-destructive/10 font-semibold text-destructive" : "bg-green-50 text-green-700")}>
          {d.bedsFree < 0 ? `${-d.bedsFree} beds short` : `${d.bedsFree} beds free`}
        </div>
      )}
      {d.noBed > 0 && <div className="mt-0.5 text-[10px] font-semibold text-destructive">{d.noBed} with no bed</div>}
      {(d.arrivals > 0 || d.departures > 0) && (
        <div className="mt-0.5 text-[10px]">
          {d.arrivals > 0 && <span className="font-semibold text-blue-600">▲{d.arrivals} </span>}
          {d.departures > 0 && <span className="font-semibold text-violet-600">▼{d.departures}</span>}
        </div>
      )}
      {(d.crewsOut.length > 0 || d.crewsIn.length > 0) && (
        <div className="truncate text-[10px] text-muted-foreground" title={[...d.crewsOut.map((c) => `${c} in`), ...d.crewsIn.map((c) => `${c} out`)].join(", ")}>
          {[...d.crewsOut, ...d.crewsIn].map((c) => c.replace(/^CREW\s+/i, "")).join("·")}
        </div>
      )}
      {d.pending > 0 && <div className="text-[10px] text-amber-700">{d.pending} pending</div>}
    </Link>
  );
}

function Kpi({ value, label, tone }: { value: number; label: string; tone?: "red" | "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        tone === "red" && "border-red-300 bg-red-50",
        tone === "amber" && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className={cn("text-2xl font-semibold tabular-nums", tone === "red" && "text-red-700", tone === "amber" && "text-amber-700", tone === "green" && "text-green-700")}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Todo({ n, title, note, href, link, tone }: { n: number; title: string; note?: string; href: string; link: string; tone?: "red" | "amber" }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          "inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded px-1 text-xs font-bold tabular-nums",
          n === 0 ? "bg-green-50 text-green-700" : tone === "red" ? "bg-red-100 text-red-700" : tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-muted text-foreground",
        )}
      >
        {n}
      </span>
      <div className="text-sm">
        <span className="font-medium">{title}</span>
        {note && <span className="text-muted-foreground"> {note}</span>}
        {n > 0 && (
          <Link href={href} className="block text-xs font-medium text-primary hover:underline">
            {link} →
          </Link>
        )}
      </div>
    </li>
  );
}
