/**
 * Whose job you came to do.
 *
 * An administrator opens somebody's appraisal from two quite different places.
 * From the status report they came to that person's own record. From a
 * manager's direct line they came to do *the manager's* job on it — the review,
 * the comment, the sign-off — and the appraisal they land on belongs to
 * somebody else entirely.
 *
 * The page could not tell the two apart, so arriving from "Acting for
 * Huimin.Liu" and clicking a report re-titled itself "Acting for Helen.Arrey",
 * which reads as having been switched to standing in for the wrong person. The
 * step taken was still the line manager's; only the page said otherwise.
 *
 * Pure so the rule about who may be named is testable: a name in a heading is
 * asserted by a query parameter, and an id nobody on this appraisal answers to
 * must not put words in the page's mouth.
 */

export interface ActingFor {
  id: string;
  name: string;
}

export interface ActingCandidate {
  id: string | null;
  name: string | null;
}

/**
 * The person named in `requested`, when they are genuinely a reviewer on this
 * appraisal — otherwise null, and the page falls back to naming the employee.
 *
 * The employee is never the answer: standing in for them on their own record is
 * the default framing, not a role you arrive holding.
 */
export function resolveActingFor(input: {
  /** The id the link asked for, straight off the query string. */
  requested: string | null | undefined;
  employeeId: string;
  /** Everyone this appraisal recognises as a reviewer of the employee. */
  candidates: ActingCandidate[];
}): ActingFor | null {
  const requested = input.requested?.trim();
  if (!requested) return null;
  if (requested === input.employeeId) return null;

  for (const c of input.candidates) {
    if (c.id && c.id === requested && c.name) return { id: c.id, name: c.name };
  }
  return null;
}

/**
 * How the page introduces itself.
 *
 * Naming both people is the point: one of them owns the step, the other owns
 * the appraisal, and an administrator standing between them needs to see which
 * is which before they type anything.
 */
export function actingHeading(actingFor: ActingFor | null, employeeName: string): string {
  return actingFor ? `Acting for ${actingFor.name}` : `Acting for ${employeeName}`;
}

export function actingSubject(actingFor: ActingFor | null, employeeName: string): string | null {
  return actingFor ? `on ${employeeName}'s appraisal` : null;
}
