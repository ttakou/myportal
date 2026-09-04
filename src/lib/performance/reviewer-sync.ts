/**
 * The reviewer on an appraisal and the line manager on the profile, together.
 *
 * They are two different fields that mean nearly the same thing. The profile's
 * manager is the reporting line: who the person answers to, who sees them on
 * Team review, what the next cycle inherits. The appraisal's manager is who
 * reviews this one appraisal. A cycle copies the first into the second at
 * launch, and from then on they drift: a launch under an older rule left over a
 * hundred appraisals naming nobody while the profiles named somebody, and a
 * transfer changes one without the other.
 *
 * HR fixed the appraisal from the status report and the profile from the admin
 * centre, two screens apart, and usually only remembered one. This decides how
 * the editor should start and what it should offer, so both can be set in the
 * one place a mismatch is noticed.
 */

export type ReportingLineState =
  /** The chosen reviewer is already the profile's line manager. */
  | "same"
  /** The profile names somebody else. */
  | "differs"
  /** The profile names nobody at all. */
  | "profile_empty"
  /** No reviewer chosen yet, so nothing to compare. */
  | "unset";

export interface ReviewerDefaults {
  /** What the line-manager field should start on. */
  initialManagerId: string;
  /** True when that start value was borrowed from the profile. */
  suggestedFromProfile: boolean;
}

/**
 * Where the editor starts.
 *
 * An appraisal naming nobody is the common fault, and the profile nearly
 * always knows the answer. Starting the field on the profile's manager turns
 * the fix into one click rather than a search; the reviewer still has to be
 * saved, so nothing is written by the suggestion itself.
 */
export function reviewerDefaults(input: {
  appraisalManagerId: string | null;
  profileManagerId: string | null;
}): ReviewerDefaults {
  if (input.appraisalManagerId) {
    return { initialManagerId: input.appraisalManagerId, suggestedFromProfile: false };
  }
  if (input.profileManagerId) {
    return { initialManagerId: input.profileManagerId, suggestedFromProfile: true };
  }
  return { initialManagerId: "", suggestedFromProfile: false };
}

export function reportingLineState(input: {
  chosenManagerId: string;
  profileManagerId: string | null;
}): ReportingLineState {
  if (!input.chosenManagerId) return "unset";
  if (!input.profileManagerId) return "profile_empty";
  return input.chosenManagerId === input.profileManagerId ? "same" : "differs";
}

/**
 * Whether to offer writing the chosen reviewer onto the profile.
 *
 * Offered only when it would change something. When the two already agree
 * there is nothing to sync, and saying so is clearer than a checkbox that
 * does nothing.
 */
export function offerProfileSync(state: ReportingLineState): boolean {
  return state === "differs" || state === "profile_empty";
}

/** The line under the field that says what the profile currently holds. */
export function reportingLineHint(input: {
  state: ReportingLineState;
  employeeName: string;
  profileManagerName: string | null;
}): string {
  const who = input.employeeName;
  switch (input.state) {
    case "same":
      return `Also ${who}'s line manager on their profile.`;
    case "differs":
      return `${who}'s profile names ${input.profileManagerName ?? "somebody else"} as line manager.`;
    case "profile_empty":
      return `${who}'s profile names no line manager.`;
    case "unset":
      return input.profileManagerName
        ? `${who}'s profile names ${input.profileManagerName} as line manager.`
        : `${who}'s profile names no line manager.`;
  }
}
