/**
 * The monthly offshore report: who was on board each day of a month, and what
 * follows from it — daily POB against capacity, man-days per company (for
 * recharging contractors), meals per company (to check the caterer's invoice
 * against the meal sheets), overstayers and late date changes.
 *
 * "On board on a day" follows the meal sheet's rule, so man-days and meals
 * line up: a trip counts from its mobilise day up to (not including) the day
 * it was demobilised; still on board counts every day up to today. A visit
 * counts from departure up to its return day for someone still on board, or
 * the days before it for someone who has returned. Days after today never
 * count.
 *
 * Pure: rows in, figures out. Dates are "YYYY-MM-DD".
 */

import { scheduleStateOf } from "./pob-classify";
import type { RotationCycle } from "./rotation-math";

export interface ReportTrip {
  person: string;
  company: string | null;
  crew_id: string | null;
  installation_id: string | null;
  status: string;
  mobilize_date: string;
  demob_date: string | null;
}

export interface ReportVisit {
  person: string;
  company: string | null;
  installation_id: string | null;
  status: string;
  depart_date: string;
  return_date: string | null;
}

export interface ReportMeal {
  meal_date: string;
  person_name: string;
  category: string;
  breakfast: boolean;
  snack: boolean;
  lunch: boolean;
  dinner: boolean;
  lodging: boolean;
}

export interface ReportInstallation {
  id: string;
  name: string;
  capacity: number;
}

export const UNKNOWN_COMPANY = "No company recorded";

/** Every day of a "YYYY-MM" month, up to `lastDay` when given. */
export function daysOfMonth(month: string, lastDay?: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCMonth() === m - 1) {
    const iso = d.toISOString().slice(0, 10);
    if (lastDay && iso > lastDay) break;
    out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function tripAboardOn(t: ReportTrip, day: string): boolean {
  if (t.mobilize_date > day) return false;
  if (t.status === "onboard") return true;
  return t.status === "demobilised" && !!t.demob_date && t.demob_date > day;
}

export function visitAboardOn(v: ReportVisit, day: string): boolean {
  if (v.depart_date > day) return false;
  if (v.status === "onboard") return !v.return_date || v.return_date >= day;
  return v.status === "returned" && !!v.return_date && v.return_date > day;
}

const norm = (s: string | null | undefined) => (s ?? "").trim();

export interface MonthlyReport {
  month: string;
  days: { date: string; total: number; byInstallation: Record<string, number> }[];
  installations: {
    id: string;
    name: string;
    capacity: number;
    peak: number;
    peakDate: string | null;
    average: number;
    lowest: number;
    daysOverCapacity: number;
  }[];
  totals: { manDays: number; peak: number; peakDate: string | null; average: number; people: number };
  companies: {
    company: string;
    manDays: number;
    people: number;
    meals: { breakfast: number; snack: number; lunch: number; dinner: number; lodging: number };
  }[];
  overstayers: { person: string; company: string | null; days: number; from: string; to: string }[];
}

export function buildMonthlyReport(input: {
  month: string;
  today: string;
  trips: ReportTrip[];
  visits: ReportVisit[];
  installations: ReportInstallation[];
  defaultInstallationId: string | null;
  cycles: Map<string, RotationCycle>;
  meals: ReportMeal[];
  /** Company of a person on the meal sheet (roster, visit requests), by name. */
  companyByName: Map<string, string | null>;
}): MonthlyReport {
  const days = daysOfMonth(input.month, input.today);
  const instOf = (id: string | null) => id ?? input.defaultInstallationId ?? "";

  const dayRows: MonthlyReport["days"] = [];
  const manDays = new Map<string, number>();
  const people = new Map<string, Set<string>>();
  const everyone = new Set<string>();
  const over = new Map<string, { person: string; company: string | null; days: number; from: string; to: string }>();

  const count = (company: string | null, person: string) => {
    const c = norm(company) || UNKNOWN_COMPANY;
    manDays.set(c, (manDays.get(c) ?? 0) + 1);
    if (!people.has(c)) people.set(c, new Set());
    people.get(c)!.add(person);
    everyone.add(person);
  };

  for (const day of days) {
    const byInst: Record<string, number> = {};
    const seen = new Set<string>();
    let total = 0;
    for (const t of input.trips) {
      if (!tripAboardOn(t, day) || seen.has(t.person)) continue;
      seen.add(t.person);
      total++;
      const inst = instOf(t.installation_id);
      byInst[inst] = (byInst[inst] ?? 0) + 1;
      count(t.company, t.person);
      // Overstaying by the crew's rotation (or a passed return date with no crew).
      const state = scheduleStateOf({
        todayIso: day,
        mobilizeDate: t.mobilize_date,
        demobDate: t.status === "onboard" ? t.demob_date : null,
        cycle: t.crew_id ? input.cycles.get(t.crew_id) ?? null : null,
      });
      if (state === "overstaying") {
        const o = over.get(t.person) ?? { person: t.person, company: t.company, days: 0, from: day, to: day };
        o.days++;
        o.to = day;
        over.set(t.person, o);
      }
    }
    for (const v of input.visits) {
      if (!visitAboardOn(v, day) || seen.has(v.person)) continue;
      seen.add(v.person);
      total++;
      const inst = instOf(v.installation_id);
      byInst[inst] = (byInst[inst] ?? 0) + 1;
      count(v.company, v.person);
    }
    dayRows.push({ date: day, total, byInstallation: byInst });
  }

  const installations = input.installations.map((i) => {
    const series = dayRows.map((d) => ({ date: d.date, n: d.byInstallation[i.id] ?? 0 }));
    const peakRow = series.reduce<{ date: string | null; n: number }>((a, b) => (b.n > a.n ? b : a), { date: null, n: 0 });
    const sum = series.reduce((n, s) => n + s.n, 0);
    return {
      id: i.id,
      name: i.name,
      capacity: i.capacity,
      peak: peakRow.n,
      peakDate: peakRow.date,
      average: series.length ? Math.round((sum / series.length) * 10) / 10 : 0,
      lowest: series.length ? Math.min(...series.map((s) => s.n)) : 0,
      daysOverCapacity: i.capacity > 0 ? series.filter((s) => s.n > i.capacity).length : 0,
    };
  });

  const peakDay = dayRows.reduce<{ date: string | null; total: number }>(
    (a, b) => (b.total > a.total ? { date: b.date, total: b.total } : a),
    { date: null, total: 0 },
  );
  const totalManDays = [...manDays.values()].reduce((a, b) => a + b, 0);

  // Meals per company, from the saved meal sheets of the month (served ticks).
  const meals = new Map<string, { breakfast: number; snack: number; lunch: number; dinner: number; lodging: number }>();
  for (const m of input.meals) {
    if (!m.meal_date.startsWith(input.month) || m.meal_date > input.today) continue;
    const c = norm(input.companyByName.get(m.person_name.trim().toLowerCase())) || UNKNOWN_COMPANY;
    const t = meals.get(c) ?? { breakfast: 0, snack: 0, lunch: 0, dinner: 0, lodging: 0 };
    if (m.breakfast) t.breakfast++;
    if (m.snack) t.snack++;
    if (m.lunch) t.lunch++;
    if (m.dinner) t.dinner++;
    if (m.lodging) t.lodging++;
    meals.set(c, t);
  }

  const companyNames = new Set([...manDays.keys(), ...meals.keys()]);
  const companies = [...companyNames]
    .map((company) => ({
      company,
      manDays: manDays.get(company) ?? 0,
      people: people.get(company)?.size ?? 0,
      meals: meals.get(company) ?? { breakfast: 0, snack: 0, lunch: 0, dinner: 0, lodging: 0 },
    }))
    .sort((a, b) => b.manDays - a.manDays || a.company.localeCompare(b.company));

  return {
    month: input.month,
    days: dayRows,
    installations,
    totals: {
      manDays: totalManDays,
      peak: peakDay.total,
      peakDate: peakDay.date,
      average: dayRows.length ? Math.round((totalManDays / dayRows.length) * 10) / 10 : 0,
      people: everyone.size,
    },
    companies,
    overstayers: [...over.values()].sort((a, b) => b.days - a.days || a.person.localeCompare(b.person)),
  };
}
