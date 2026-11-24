import Link from "next/link";
import { BedDouble, ClipboardCheck, Gavel, Printer, ShieldX, Sun, UtensilsCrossed } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPobBreakdown } from "@/lib/offshore";
import { siteToday } from "@/lib/offshore/manifest-order";
import { getToday } from "@/lib/offshore/today-run";
import { tenantId } from "../_actions/_shared";
import { MoveDecision, PaxTicks, RunControls } from "./today-client";

/**
 * Today: each offshore role's work for the day on one page, so nobody hunts
 * through tabs. The OIM sees what must be decided before tonight's run, the
 * Dispatcher today's runs with tick boxes, the Campboss today's arrivals
 * needing beds and the meal count. Admins see all three.
 */

const longDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function Section({ icon: Icon, title, hint, children }: { icon: typeof Sun; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-baseline gap-2 border-b px-4 py-3">
        <Icon className="h-4 w-4 self-center text-primary" />
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export default async function TodayPage() {
  const access = await getAccess();
  const asOim = access.isAdmin || access.isOim;
  const asDispatcher = access.isAdmin || access.isDispatcher;
  const asCampboss = access.isAdmin || access.isCampboss;
  if (!asOim && !asDispatcher && !asCampboss) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">Today is for the OIM, the Dispatcher and the Campboss.</p>
      </div>
    );
  }
  const tenant = await tenantId();
  const admin = createAdminClient();
  if (!tenant || !admin) return <p className="p-8 text-sm text-muted-foreground">No organisation in scope.</p>;

  const today = siteToday();
  const [t, pob] = await Promise.all([getToday(admin, tenant, today), asCampboss ? getPobBreakdown() : Promise.resolve(null)]);
  const due = t.moves.filter((m) => m.due);
  const later = t.moves.length - due.length;
  const decisions = due.length + t.trips.length + t.visits.length;
  const noRoom = pob ? pob.people.filter((p) => !p.room_id && p.beds_managed) : [];
  const runOn = t.run.manifests.filter((m) => m.direction === "out").reduce((n, m) => n + m.pax, 0);
  const runOff = t.run.manifests.filter((m) => m.direction === "in").reduce((n, m) => n + m.pax, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sun className="h-6 w-6 text-primary" /> Today
        </h1>
        <p className="text-muted-foreground">
          {longDate(today)} · tonight&apos;s run is at 05:00 on {shortDate(t.tomorrow)}.
        </p>
      </div>

      {asOim && (
        <Section icon={Gavel} title="OIM — decide before tonight's run" hint={decisions ? `${decisions} waiting` : "nothing waiting"}>
          {decisions === 0 ? (
            <p className="text-sm text-green-700">Nothing to decide before tonight&apos;s run. ✓</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {due.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.what}</span>
                  {m.status === "pending_endorsement" && (
                    <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">not endorsed yet</span>
                  )}
                  {m.reason && <span className="text-xs italic text-muted-foreground">“{m.reason}”</span>}
                  <span className="ml-auto">
                    <MoveDecision id={m.id} name={m.name} />
                  </span>
                </li>
              ))}
              {t.trips.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">Trip request · mobilise {r.date}{r.detail ? ` · ${r.detail}` : ""}</span>
                  <Link href="/offshore?view=requests" className="ml-auto text-xs font-medium text-primary hover:underline">
                    Decide →
                  </Link>
                </li>
              ))}
              {t.visits.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">Visit request · travels {r.date}{r.detail ? ` · ${r.detail}` : ""}</span>
                  <Link href="/offshore?view=requests" className="ml-auto text-xs font-medium text-primary hover:underline">
                    Decide →
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {later > 0 && (
            <p className="text-xs text-muted-foreground">
              {later} more date change{later === 1 ? "" : "s"} for later days —{" "}
              <Link href="/offshore?view=requests" className="text-primary hover:underline">see them all</Link>.
            </p>
          )}
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">
              Tonight&apos;s run ({shortDate(t.run.date)}, 05:00):{" "}
              {t.run.manifests.length ? `${runOn} to mobilise, ${runOff} to demobilise` : "no crew change"}
            </p>
            {t.run.manifests.length > 0 && (
              <ul className="mt-1 text-xs text-muted-foreground">
                {t.run.manifests.map((m) => (
                  <li key={m.id}>
                    {m.direction === "out" ? "MOB" : "DEMOB"} · {m.title} · {m.pax} people
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}

      {asDispatcher && (
        <Section
          icon={ClipboardCheck}
          title="Dispatcher — today's runs"
          hint={t.manifests.length ? `${t.manifests.length} manifest${t.manifests.length === 1 ? "" : "s"}` : "no runs today"}
        >
          {(() => {
            // The night run moved people before the boat went: ask for the real outcome.
            const open = t.manifests.filter((m) => m.status !== "completed" && m.moved > 0);
            if (!open.length) return null;
            const on = open.filter((m) => m.direction === "out").reduce((n, m) => n + m.moved, 0);
            const off = open.filter((m) => m.direction === "in").reduce((n, m) => n + m.moved, 0);
            return (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-semibold">
                  Tonight&apos;s run moved {on} on and {off} off — confirm who actually travelled.
                </p>
                <p className="text-xs">
                  Once the boat or helicopter has gone: mark anyone who didn&apos;t travel as <strong>No-show</strong> (POB is
                  corrected straight away), add anyone who travelled but isn&apos;t listed, then press <strong>Confirm run</strong>.
                </p>
              </div>
            );
          })()}
          {t.manifests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No runs today.{" "}
              {t.run.manifests.length > 0 && (
                <>
                  Tomorrow: {t.run.manifests.length} manifest{t.run.manifests.length === 1 ? "" : "s"} —{" "}
                  <Link href="/offshore?view=manifests" className="text-primary hover:underline">open Manifests</Link>.
                </>
              )}
            </p>
          ) : (
            t.manifests.map((m) => (
              <div key={m.id} className="rounded-md border">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  <span
                    className={
                      m.direction === "out"
                        ? "rounded bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-800"
                        : "rounded bg-orange-100 px-1.5 text-[11px] font-semibold text-orange-800"
                    }
                  >
                    {m.direction === "out" ? "MOB" : "DEMOB"}
                  </span>
                  <span className="text-sm font-medium">{m.title}</span>
                  <span className="text-xs text-muted-foreground">{m.transport ?? "boat"} · {m.status}</span>
                  <a
                    href={`/offshore-manifest/${m.id}`}
                    target="_blank"
                    rel="noopener"
                    className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium hover:bg-accent"
                  >
                    <Printer className="h-3 w-3" /> Sign-off sheet
                  </a>
                </div>
                <PaxTicks pax={m.pax} canTick={m.status !== "completed"} />
                {m.status === "completed" && m.confirmedAt ? (
                  <p className="border-t px-3 py-1.5 text-xs text-green-700">
                    Confirmed{m.confirmedBy ? ` by ${m.confirmedBy}` : ""} at{" "}
                    {new Date(m.confirmedAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Douala", hour: "2-digit", minute: "2-digit" })}
                  </p>
                ) : null}
                <RunControls
                  manifestId={m.id}
                  direction={m.direction}
                  picks={m.direction === "out" ? t.pickAshore : t.pickAboard}
                  confirmed={m.status === "completed"}
                />
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            The night run moves crews by the schedule; marking a no-show corrects POB for anyone who didn&apos;t travel.
            Ticks record who travelled; <strong>Confirm run</strong> settles the rest and closes the manifest.
          </p>
        </Section>
      )}

      {asCampboss && (
        <Section icon={BedDouble} title="Campboss — beds and meals today">
          <div>
            <h3 className="mb-1 text-sm font-semibold">
              Arriving today without a bed · {t.arrivalsNeedingBeds.length}
            </h3>
            {t.arrivalsNeedingBeds.length === 0 ? (
              <p className="text-sm text-green-700">Everyone arriving today has a bed. ✓</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {t.arrivalsNeedingBeds.map((a, i) => (
                  <li key={`${a.name}-${i}`} className="flex flex-wrap gap-2 px-3 py-1.5">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground">{a.why} · {a.manifest}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {noRoom.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">On board now with no room · {noRoom.length}</h3>
              <p className="text-xs text-muted-foreground">
                {noRoom.slice(0, 12).map((p) => p.name).join(", ")}
                {noRoom.length > 12 ? `, and ${noRoom.length - 12} more` : ""}
              </p>
            </div>
          )}
          <Link href="/offshore?view=bedboard" className="inline-block text-xs font-medium text-primary hover:underline">
            Open the bed board →
          </Link>

          <div>
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <UtensilsCrossed className="h-3.5 w-3.5" /> Meal count today
            </h3>
            {t.meals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Today&apos;s meal sheet isn&apos;t built yet —{" "}
                <Link href="/offshore?view=catering" className="text-primary hover:underline">open Catering</Link>.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Installation</th>
                      <th className="py-1 pr-3 text-right font-medium">On sheet</th>
                      <th className="py-1 pr-3 text-right font-medium">Breakfast</th>
                      <th className="py-1 pr-3 text-right font-medium">Snack</th>
                      <th className="py-1 pr-3 text-right font-medium">Lunch</th>
                      <th className="py-1 pr-3 text-right font-medium">Dinner</th>
                      <th className="py-1 text-right font-medium">Lodging</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {t.meals.map((m) => (
                      <tr key={m.installation} className="border-b last:border-0">
                        <td className="py-1 pr-3 font-medium">{m.installation}</td>
                        <td className="py-1 pr-3 text-right">{m.people}</td>
                        <td className="py-1 pr-3 text-right">{m.breakfast}</td>
                        <td className="py-1 pr-3 text-right">{m.snack}</td>
                        <td className="py-1 pr-3 text-right font-semibold">{m.lunch}</td>
                        <td className="py-1 pr-3 text-right">{m.dinner}</td>
                        <td className="py-1 text-right">{m.lodging}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
