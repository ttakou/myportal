import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getStatement } from "@/lib/savings";
import { getTenantBranding } from "@/lib/branding";
import { money, type SavingsTxn, type Statement } from "@/types/savings";
import { PrintButton } from "./print-button";

const SOFTWARE_NAME = "MyEnterprisePortal";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string): string {
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; profile?: string }>;
}) {
  const sp = await searchParams;
  const [access, role, branding, supabase] = await Promise.all([
    getAccess(),
    getCurrentRole(),
    getTenantBranding(),
    Promise.resolve(createClient()),
  ]);
  const isAdmin = isAdminRole(role) || access.isSystemAdmin;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Admins may print any member's statement via ?profile=; everyone else is
  // pinned to their own account.
  const profileId = isAdmin && sp.profile ? sp.profile : user.id;

  const now = new Date();
  const defaultFrom = isoDate(new Date(now.getFullYear(), 0, 1));
  const defaultTo = isoDate(now);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : defaultFrom;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : defaultTo;

  const statement = await getStatement(profileId, from, to);

  return (
    <div className="space-y-4">
      {/* Controls — hidden when printing */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/savings?view=mine"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to savings
        </Link>
        <form method="get" className="flex flex-wrap items-end gap-2">
          {isAdmin && sp.profile && <input type="hidden" name="profile" value={sp.profile} />}
          <label className="text-sm">
            <span className="mr-1 text-muted-foreground">From</span>
            <input type="date" name="from" defaultValue={from} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mr-1 text-muted-foreground">To</span>
            <input type="date" name="to" defaultValue={to} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
            Apply
          </button>
          <PrintButton />
        </form>
      </div>

      {statement ? (
        <StatementDocument
          statement={statement}
          brandName={branding.name}
          primary={branding.primary}
          logoUrl={branding.logoUrl}
          generatedAt={now}
        />
      ) : (
        <p className="rounded-md border bg-card p-8 text-center text-muted-foreground">
          No savings account found for this member.
        </p>
      )}
    </div>
  );
}

function StatementDocument({
  statement,
  brandName,
  primary,
  logoUrl,
  generatedAt,
}: {
  statement: Statement;
  brandName: string;
  primary: string;
  logoUrl: string | null;
  generatedAt: Date;
}) {
  const { holder } = statement;
  const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties;

  return (
    <article
      className="relative mx-auto max-w-3xl overflow-hidden rounded-lg border bg-white text-[13px] text-neutral-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none"
      style={exact}
    >
      {/* Header band */}
      <header
        className="flex items-start justify-between gap-4 px-8 py-6 text-white"
        style={{ backgroundColor: primary, ...exact }}
      >
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="h-12 w-auto bg-white/95 rounded p-1" />
          ) : (
            <div className="rounded bg-white/15 px-3 py-2 text-lg font-bold tracking-tight">{brandName}</div>
          )}
          <div>
            <p className="text-lg font-semibold leading-tight">{brandName}</p>
            <p className="text-xs/relaxed opacity-90">Employee Savings Account Statement</p>
          </div>
        </div>
        <div className="text-right text-xs opacity-95">
          <p className="font-semibold">Statement period</p>
          <p>
            {fmtDate(statement.from)} – {fmtDate(statement.to)}
          </p>
        </div>
      </header>

      {/* Account holder */}
      <section className="grid grid-cols-2 gap-x-8 gap-y-2 border-b px-8 py-5">
        <Detail label="Account holder" value={holder.full_name ?? "—"} strong />
        <Detail label="Employee number" value={holder.emp_num ?? "—"} />
        <Detail label="Department" value={holder.department ?? "—"} />
        <Detail label="Job title" value={holder.job_title ?? "—"} />
        <Detail label="Email" value={holder.email ?? "—"} />
        <Detail label="Member type" value={holder.employee_type ?? "—"} className="capitalize" />
      </section>

      {/* Balance summary */}
      <section className="grid grid-cols-4 gap-4 px-8 py-5">
        <Summary label="Opening balance" value={money(statement.openingBalance)} />
        <Summary label="Total in" value={`+${money(statement.totalIn)}`} className="text-green-700" />
        <Summary label="Total out" value={`−${money(statement.totalOut)}`} className="text-red-700" />
        <Summary label="Closing balance" value={money(statement.closingBalance)} strong />
      </section>

      {/* Transactions */}
      <section className="px-8 pb-2">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-y text-left text-[11px] uppercase tracking-wide text-neutral-500" style={exact}>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 text-right font-medium">Money out</th>
              <th className="py-2 pr-3 text-right font-medium">Money in</th>
              <th className="py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b text-neutral-500">
              <td className="py-2 pr-3" colSpan={4}>
                Opening balance
              </td>
              <td className="py-2 text-right tabular-nums">{money(statement.openingBalance)}</td>
            </tr>
            {statement.transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-neutral-400">
                  No transactions in this period.
                </td>
              </tr>
            )}
            {renderRows(statement)}
            <tr className="border-t font-semibold">
              <td className="py-2 pr-3" colSpan={4}>
                Closing balance
              </td>
              <td className="py-2 text-right tabular-nums">{money(statement.closingBalance)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Electronic stamp */}
      <div className="flex items-center justify-end px-8 pb-4 pt-2">
        <Stamp brandName={brandName} primary={primary} date={generatedAt} />
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t px-8 py-3 text-[11px] text-neutral-500" style={exact}>
        <span>
          All amounts in XAF (Central African CFA franc). This is a system-generated statement and
          is valid without a handwritten signature.
        </span>
        <span className="whitespace-nowrap">
          Powered by <span className="font-semibold text-neutral-700">{SOFTWARE_NAME}</span>
        </span>
      </footer>
    </article>
  );
}

/** Render each transaction with a running balance starting from the opening balance. */
function renderRows(statement: Statement) {
  let running = statement.openingBalance;
  return statement.transactions.map((t: SavingsTxn) => {
    const isIn = t.kind === "contribution";
    running += isIn ? t.amount : -t.amount;
    const date = (t.period ?? t.created_at).slice(0, 10);
    return (
      <tr key={t.id} className="border-b last:border-b-0">
        <td className="py-2 pr-3 tabular-nums text-neutral-600">{fmtDate(date)}</td>
        <td className="py-2 pr-3">{t.note ?? (isIn ? "Contribution" : "Withdrawal")}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-red-700">{isIn ? "" : money(t.amount)}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-green-700">{isIn ? money(t.amount) : ""}</td>
        <td className="py-2 text-right tabular-nums">{money(running)}</td>
      </tr>
    );
  });
}

function Detail({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`${strong ? "font-semibold" : ""} ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function Summary({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="rounded-md border bg-neutral-50 px-3 py-2" style={{ WebkitPrintColorAdjust: "exact" } as React.CSSProperties}>
      <p className="text-[10.5px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`tabular-nums ${strong ? "text-base font-bold" : "font-medium"} ${className ?? ""}`}>{value}</p>
    </div>
  );
}

/** A circular "electronic stamp" rendered inline as SVG so it prints crisply. */
function Stamp({ brandName, primary, date }: { brandName: string; primary: string; date: Date }) {
  const stamped = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const top = brandName.toUpperCase().slice(0, 26);
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-12 opacity-90" aria-label="Electronic stamp">
      <defs>
        <path id="stamp-top" d="M 66 66 m -46 0 a 46 46 0 1 1 92 0" fill="none" />
        <path id="stamp-bottom" d="M 20 66 a 46 46 0 0 0 92 0" fill="none" />
      </defs>
      <circle cx="66" cy="66" r="62" fill="none" stroke={primary} strokeWidth="2" />
      <circle cx="66" cy="66" r="50" fill="none" stroke={primary} strokeWidth="1" />
      <text fill={primary} fontSize="9" fontWeight="bold" letterSpacing="1.2">
        <textPath href="#stamp-top" startOffset="50%" textAnchor="middle">
          {top}
        </textPath>
      </text>
      <text fill={primary} fontSize="8" letterSpacing="1">
        <textPath href="#stamp-bottom" startOffset="50%" textAnchor="middle">
          OFFICIAL · SAVINGS
        </textPath>
      </text>
      <text x="66" y="58" textAnchor="middle" fill={primary} fontSize="11" fontWeight="bold">
        VERIFIED
      </text>
      <line x1="34" y1="66" x2="98" y2="66" stroke={primary} strokeWidth="1" />
      <text x="66" y="80" textAnchor="middle" fill={primary} fontSize="8">
        {stamped}
      </text>
    </svg>
  );
}
