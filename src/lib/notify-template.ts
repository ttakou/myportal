import type { RecipientRole } from "@/types/notifications";

export interface DispatchContext {
  tenantId: string;
  /** Profile ids available for each recipient role. */
  employeeIds?: string[];
  managerIds?: string[];
  secondLevelIds?: string[];
  hrIds?: string[];
  calibrationIds?: string[];
  /** Values substituted into {{placeholders}} in templates. */
  placeholders?: Record<string, string>;
  /** Where the notification links to. */
  url?: string;
}

/** Replace {{token}} placeholders (whitespace-tolerant) from a value map. */
export function renderTemplate(tpl: string | null | undefined, values: Record<string, string> = {}): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

/** Resolve a rule's recipient roles to concrete profile ids from the context. */
export function resolveRuleProfileIds(recipients: RecipientRole[], ctx: DispatchContext): string[] {
  const byRole: Record<RecipientRole, string[] | undefined> = {
    employee: ctx.employeeIds,
    line_manager: ctx.managerIds,
    second_level: ctx.secondLevelIds,
    hr: ctx.hrIds,
    calibration: ctx.calibrationIds,
  };
  const ids = recipients.flatMap((r) => byRole[r] ?? []);
  return [...new Set(ids.filter(Boolean))];
}
