/**
 * The transportation reports on offer. A plain module: the server page
 * resolves `?report=` against it, and the client panel draws the tabs.
 * (Exporting this from the client component would hand the server a
 * client reference, not an array.)
 */

export type ReportKey = "overview" | "drivers" | "vehicles" | "requesters" | "routes" | "peaks" | "shuttles" | "approvals";

export const REPORT_TABS: { key: ReportKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "drivers", label: "Drivers" },
  { key: "vehicles", label: "Vehicles & fuel" },
  { key: "requesters", label: "Requesters" },
  { key: "routes", label: "Routes" },
  { key: "peaks", label: "Peak times" },
  { key: "shuttles", label: "Shuttles" },
  { key: "approvals", label: "Approvals" },
];

export function resolveReportKey(raw: string | null | undefined): ReportKey {
  return REPORT_TABS.some((t) => t.key === raw) ? (raw as ReportKey) : "overview";
}
