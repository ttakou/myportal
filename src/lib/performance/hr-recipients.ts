/**
 * Who "HR" means when a notification is addressed to a role rather than a person.
 *
 * Every other recipient role resolves to somebody named on the appraisal — the
 * employee, their line manager, the second-level reviewer. HR and the
 * calibration committee do not: nobody is assigned, because holding the role is
 * what makes you HR. The dispatcher had a slot for those ids and no caller ever
 * filled it, so any rule addressed to HR resolved to an empty list and reached
 * nobody at all while the settings screen showed it as enabled.
 */

/** A row of the functional-role table: who holds which role. */
export interface RoleHolder {
  profile_id: string;
  role: string;
}

/**
 * The people a notice addressed to HR should reach.
 *
 * HR admins are the intended audience. System admins are a technical role and
 * should not be copied on every calibration notice — but they are treated as HR
 * everywhere else in the app, so they stand in when a tenant has named no HR
 * admin at all. Reaching the wrong inbox beats reaching none, which is the
 * failure this exists to prevent.
 */
export function pickHrRecipients(holders: RoleHolder[]): string[] {
  const hr = unique(holders.filter((h) => h.role === "hr_admin").map((h) => h.profile_id));
  if (hr.length) return hr;
  return unique(holders.filter((h) => h.role === "system_admin").map((h) => h.profile_id));
}

/**
 * The people a notice addressed to the PGM should reach.
 *
 * The final rating may be recorded by the PGM or by an HR admin, so a notice
 * about it should reach whoever can act. PGM holders first; HR admins stand in
 * where nobody holds the role, on the same reasoning as above.
 */
export function pickPgmRecipients(holders: RoleHolder[]): string[] {
  const pgm = unique(holders.filter((h) => h.role === "pgm").map((h) => h.profile_id));
  if (pgm.length) return pgm;
  return pickHrRecipients(holders);
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

/** Roles that resolve to a role-holder list rather than to a named person. */
export const ROLE_ADDRESSED = ["hr", "calibration", "pgm"] as const;

/** The functional roles those lists are drawn from. */
export const ROLE_HOLDER_ROLES = ["pgm", "hr_admin", "system_admin"];

/** Whether any of these rules is addressed to a role rather than a person. */
export function needsHrRecipients(rules: { recipients: string[] }[]): boolean {
  return rules.some((r) => r.recipients.some((x) => (ROLE_ADDRESSED as readonly string[]).includes(x)));
}
