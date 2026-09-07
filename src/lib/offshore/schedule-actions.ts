/**
 * What the rotation schedule asks for on a given day.
 *
 * The schedule drove the dashboard and "Where is…" but acted on nothing:
 * crew changes were opened by hand, demobs closed by hand, nobody was told a
 * change was coming, and trips nobody took sat in "requested" for months.
 * This module reads the crews' cycles for one day and says what is due —
 * which crews change today, which change in three days, which trips are
 * stale. Pure: crews and dates in, a list of things to do out. The nightly
 * job (`schedule-run`) carries them out and tells people.
 */

import { currentCrewChange, type CrewChange } from "./crew-change";
import { cycleDayIndex, type RotationCycle } from "./rotation-math";

/** A crew as the job sees it: its cycle and how many of it are where. */
export interface ScheduledCrew {
  id: string;
  name: string;
  cycle: RotationCycle;
  /** People on the crew's roster. */
  members: number;
  /** Of those, how many have an on-board trip today. */
  aboard: number;
}

export type CrewChangeKind = "mobilise" | "demobilise";

export interface CrewChangeDue {
  crewId: string;
  crewName: string;
  action: CrewChangeKind;
  /** The date the schedule puts the change on. */
  date: string;
  /** People the change moves: those ashore for a mobilise, those aboard for a demob. */
  count: number;
  /** The hitch the change opens or closes. */
  hitchFrom: string;
  hitchTo: string;
}

/**
 * Crew changes the schedule puts on `todayIso` itself.
 *
 * A mobilise on the first day of the offshore phase, for whoever is not yet
 * aboard (somebody boarded early stays as they are); a demobilise on the
 * first day of the onshore phase, for whoever is still aboard. Only the day:
 * a change missed yesterday is not opened late and backdated by a job nobody
 * watched — the dashboard's "Crew changes due" prompt carries it from there.
 */
export function crewChangesDueToday(crews: ScheduledCrew[], todayIso: string): CrewChangeDue[] {
  const out: CrewChangeDue[] = [];
  for (const c of crews) {
    const idx = cycleDayIndex(c.cycle, todayIso);
    if (idx === null || c.members === 0) continue;
    const change = currentCrewChange(c.cycle, todayIso);
    if (!change) continue;
    if (idx === 0 && c.members > c.aboard) {
      out.push({
        crewId: c.id,
        crewName: c.name,
        action: "mobilise",
        date: todayIso,
        count: c.members - c.aboard,
        hitchFrom: change.hitchFrom,
        hitchTo: change.hitchTo,
      });
    } else if (idx === c.cycle.offshore_days && c.aboard > 0) {
      // The hitch that just ended, not the next one the schedule now points at.
      out.push({
        crewId: c.id,
        crewName: c.name,
        action: "demobilise",
        date: todayIso,
        count: c.aboard,
        hitchFrom: change.onshoreSince ?? todayIso,
        hitchTo: todayIso,
      });
    }
  }
  return out;
}

/** How many days before a crew change people are told it is coming. */
export const REMIND_DAYS_BEFORE = 3;

export interface CrewChangeAhead {
  crewId: string;
  crewName: string;
  action: CrewChangeKind;
  date: string;
  change: CrewChange;
}

/**
 * Crew changes exactly `daysAhead` days away, for the reminders.
 *
 * Exactly, not "within": the job runs nightly and the reminder is one
 * message, three days out. The day-of and day-after cases are the dashboard's.
 */
export function crewChangesAhead(
  crews: ScheduledCrew[],
  todayIso: string,
  daysAhead = REMIND_DAYS_BEFORE,
): CrewChangeAhead[] {
  const out: CrewChangeAhead[] = [];
  for (const c of crews) {
    if (c.members === 0) continue;
    const change = currentCrewChange(c.cycle, todayIso);
    if (!change || change.daysToChange !== daysAhead) continue;
    out.push({
      crewId: c.id,
      crewName: c.name,
      action: change.phase === "offshore" ? "demobilise" : "mobilise",
      date: change.nextChange,
      change,
    });
  }
  return out;
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** The reminder to the person on the crew. */
export function reminderForMember(
  a: CrewChangeAhead,
  installation: string | null,
): { title: string; body: string } {
  const where = installation ?? "the installation";
  if (a.action === "mobilise") {
    const length = Math.round(
      (Date.parse(a.change.hitchTo + "T00:00:00Z") - Date.parse(a.change.hitchFrom + "T00:00:00Z")) /
        86_400_000,
    );
    return {
      title: `Crew change in ${days(REMIND_DAYS_BEFORE)}: ${a.crewName} goes offshore on ${a.date}`,
      body: `You are due on ${where} on ${a.date} for ${days(length)}, until ${a.change.hitchTo}. Check your travel, cabin and certificates before you go.`,
    };
  }
  return {
    title: `Crew change in ${days(REMIND_DAYS_BEFORE)}: ${a.crewName} comes off on ${a.date}`,
    body: `Your hitch on ${where} ends on ${a.date}. Make sure your cabin and hand-over are ready.`,
  };
}

/** The reminder to somebody's back-to-back. */
export function reminderForBackToBack(
  a: CrewChangeAhead,
  personName: string,
): { title: string; body: string } {
  return a.action === "mobilise"
    ? {
        title: `Your back-to-back ${personName} goes offshore on ${a.date}`,
        body: `${a.crewName} changes in ${days(REMIND_DAYS_BEFORE)}. Plan the hand-over with ${personName}.`,
      }
    : {
        title: `Your back-to-back ${personName} comes off on ${a.date}`,
        body: `${a.crewName} changes in ${days(REMIND_DAYS_BEFORE)}. Plan the hand-over with ${personName}.`,
      };
}

/** The reminder to the crew-change desk (dispatcher, Campboss, OIM). */
export function reminderForDesk(
  a: CrewChangeAhead,
  count: number,
  acts: boolean,
): { title: string; body: string } {
  const verb = a.action === "mobilise" ? "to mobilise" : "to demobilise";
  return {
    title: `${a.crewName}: crew change on ${a.date} (${count} ${verb})`,
    body: acts
      ? `The schedule opens this change itself on the day. Check beds, transport and certificates now.`
      : `Confirm the change on the dashboard on the day. Check beds, transport and certificates now.`,
  };
}

/** A trip past its mobilise date this long with no movement is flagged… */
export const STALE_FLAG_DAYS = 7;
/** …and this long, cancelled. */
export const STALE_CANCEL_DAYS = 30;

export interface TripForStaleness {
  id: string;
  status: string;
  mobilize_date: string;
}

/** Trip states before anybody moved: a person was asked for, nothing happened. */
const NOT_MOVED = new Set(["requested", "hse_cleared", "manifested"]);

/**
 * Trips whose mobilise date passed without anybody going.
 *
 * Nine trips sat in "requested" or "cleared" for over a week past their date;
 * they counted in nobody's queue and cluttered everybody's. After a week the
 * desk is told; after a month the trip is cancelled and the person told.
 */
export function classifyStaleTrips(
  trips: TripForStaleness[],
  todayIso: string,
): { flag: TripForStaleness[]; cancel: TripForStaleness[] } {
  const today = Date.parse(todayIso + "T00:00:00Z");
  const flag: TripForStaleness[] = [];
  const cancel: TripForStaleness[] = [];
  for (const t of trips) {
    if (!NOT_MOVED.has(t.status)) continue;
    const overdue = Math.floor((today - Date.parse(t.mobilize_date + "T00:00:00Z")) / 86_400_000);
    if (overdue >= STALE_CANCEL_DAYS) cancel.push(t);
    else if (overdue >= STALE_FLAG_DAYS) flag.push(t);
  }
  return { flag, cancel };
}
