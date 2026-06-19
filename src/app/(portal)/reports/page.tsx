import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, ClipboardCheck, FileBarChart, MessageSquare, Plane, ShieldCheck, Truck, UserCheck, Utensils, UtensilsCrossed, Users } from "lucide-react";
import { getAccess } from "@/lib/auth";

export default async function ReportsPage() {
  const access = await getAccess();

  const tiles = [
    {
      href: "/reports/offshore-certifications",
      title: "Offshore certification compliance",
      description:
        "Medical / BOSIET / HUET expiry status per person, with expired and upcoming certs flagged. Filter by period and department.",
      icon: ShieldCheck,
      show: access.isSystemAdmin || access.isAdmin || access.isSafetyAdmin || access.isOim,
    },
    {
      href: "/reports/travel-expense",
      title: "Out-of-town travel & expense",
      description:
        "Estimated vs actual travel spend per trip with a per-department roll-up. Filter by period, department and traveller.",
      icon: Plane,
      show: access.isSystemAdmin || access.isAdmin || access.isFinance,
    },
    {
      href: "/reports/loan-arrears",
      title: "Savings & loan arrears",
      description:
        "Loan portfolio with arrears (scheduled-to-date vs repayments) and savings balances. Filter by period, department and borrower.",
      icon: Banknote,
      show: access.isSystemAdmin || access.isAdmin || access.isFinance,
    },
    {
      href: "/reports/access-review",
      title: "Access review",
      description:
        "Account role, functional roles and access roles per user, with privileged holders flagged. Filter by department and person.",
      icon: Users,
      show: access.isSystemAdmin || access.isAdmin,
    },
    {
      href: "/reports/performance-appraisals",
      title: "Appraisal completion & SLA",
      description:
        "Per-employee appraisal stage/status for a cycle, with overdue cases flagged and a completion rate. Filter by cycle, department and employee.",
      icon: ClipboardCheck,
      show: access.isHr || access.isSystemAdmin || access.isAdmin,
    },
    {
      href: "/reports/my-meals",
      title: "My meals",
      description:
        "Your own canteen bookings and collections — booked, collected, no-show and cancelled. Filter by period (daily/weekly/monthly…).",
      icon: Utensils,
      show: true,
    },
    {
      href: "/reports/canteen",
      title: "Canteen consumption & no-show",
      description:
        "Served vs no-show vs cancelled with department, meal-period and per-person breakdowns. For canteen management and the camp boss. Filter by period and department.",
      icon: UtensilsCrossed,
      show:
        access.isSystemAdmin ||
        access.isAdmin ||
        access.isFinance ||
        access.isCanteenManager ||
        access.isOim,
    },
    {
      href: "/reports/canteen-feedback",
      title: "Canteen feedback",
      description:
        "Food/quantity ratings, issue breakdown and feedback entries over a period. For HR and canteen management.",
      icon: MessageSquare,
      show: access.isSystemAdmin || access.isAdmin || access.isHr || access.isCanteenManager,
    },
    {
      href: "/reports/transport",
      title: "Transportation requests & SLA",
      description:
        "Ride requests over a period: completion vs cancellation, active backlog and overdue, by status, task type and department.",
      icon: Truck,
      show: access.isSystemAdmin || access.isAdmin,
    },
    {
      href: "/reports/visitors",
      title: "Visitor throughput",
      description:
        "Visits over a period: check-in/out, no-shows, average dwell time and company / host-department breakdowns. For reception and administrators.",
      icon: UserCheck,
      show: access.isSystemAdmin || access.isAdmin || access.isOim,
    },
    {
      href: "/reports/emergency",
      title: "Emergency incidents",
      description:
        "Incident volume, SOS, response times and type/severity/status breakdowns over a period. For safety and administrators.",
      icon: AlertTriangle,
      show: access.isSystemAdmin || access.isAdmin || access.isSafetyAdmin || access.isOim,
    },
  ].filter((t) => t.show);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Operational and compliance reports. Each can be filtered by period, department or person
          and exported to CSV.
        </p>
      </div>

      {tiles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No reports are available for your role yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group flex items-start justify-between gap-4 rounded-lg border bg-card p-5 shadow-sm transition hover:bg-accent"
            >
              <div className="flex items-start gap-3">
                <t.icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">{t.title}</p>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileBarChart className="h-3.5 w-3.5" /> More module reports are being added.
      </p>
    </div>
  );
}
