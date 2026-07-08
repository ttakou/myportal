import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getStatement, getOrCreateStatementCode } from "@/lib/savings";
import { getTenantBranding } from "@/lib/branding";
import { type SavingsTxn, type Statement } from "@/types/savings";
import { MedallionStamp } from "@/components/ui/medallion-stamp";
import { PrintButton } from "./print-button";

/**
 * Statement cells show plain grouped numbers (currency lives in the column
 * headers) so even billion-XAF figures fit the fixed columns. "1 000 000 000",
 * never "1 000 000 000 FCFA" in every cell.
 */
function amt(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

const SOFTWARE_NAME = "MyEnterprisePortal";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string): string {
  // Statements read cleanest with ISO dates (matches the period box).
  return iso.slice(0, 10);
}

/** hex (#RRGGBB / #RGB) -> "r, g, b" so we can build translucent brand tints. */
function hexToRgbTriplet(hex: string): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "37, 99, 235"; // sensible blue fallback
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ");
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

  // Snapshot the statement under a verification code so a printed copy can be
  // checked at /verify/statement, with a scannable QR to the verify URL.
  let verifyCode: string | null = null;
  let verifyQr: string | null = null;
  let verifyUrl: string | null = null;
  if (statement) {
    const { data: tRow } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (tRow?.id) {
      verifyCode = await getOrCreateStatementCode({
        tenantId: tRow.id as string,
        tenantName: branding.name,
        profileId,
        holderName: statement.holder.full_name,
        from,
        to,
        opening: statement.openingBalance,
        closing: statement.closingBalance,
      });
    }
    if (verifyCode) {
      const h = await headers();
      const host = h.get("host") ?? "";
      const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
      verifyUrl = `${proto}://${host}/verify/statement?code=${verifyCode}`;
      verifyQr = await QRCode.toString(verifyUrl, { type: "svg", margin: 0, width: 96 }).catch(() => null);
    }
  }

  return (
    <div className="space-y-4">
      {/* A4 page geometry for printing; the sheet itself is sized to the A4
          content width so it prints 1:1 and reads balanced on screen. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  .statement-sheet { width: 100% !important; max-width: none !important; box-shadow: none !important; }
}`,
        }}
      />
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
          addressLines={branding.addressLines ?? null}
          contact={branding.contact ?? null}
          generatedAt={now}
          verifyCode={verifyCode}
          verifyQr={verifyQr}
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
  addressLines,
  contact,
  generatedAt,
  verifyCode,
  verifyQr,
}: {
  statement: Statement;
  brandName: string;
  primary: string;
  logoUrl: string | null;
  addressLines: string[] | null;
  contact: string | null;
  generatedAt: Date;
  verifyCode: string | null;
  verifyQr: string | null;
}) {
  const { holder } = statement;
  const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties;
  const rgb = hexToRgbTriplet(primary);
  const headerCell: React.CSSProperties = { backgroundColor: primary, color: "#fff", ...exact };
  const zebra: React.CSSProperties = { backgroundColor: `rgba(${rgb}, 0.10)`, ...exact };
  const acctNo = holder.emp_num ?? holder.profile_id.slice(0, 8).toUpperCase();

  return (
    <article
      className="statement-sheet mx-auto w-full max-w-[210mm] bg-white px-5 py-6 text-[12px] text-neutral-900 shadow-sm ring-1 ring-neutral-200 sm:px-8 sm:py-8 sm:text-[13px] print:max-w-none print:px-0 print:py-0 print:shadow-none print:ring-0"
      style={exact}
    >
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b-2 pb-4" style={{ borderColor: primary }}>
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16" />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white sm:h-16 sm:w-16"
              style={{ backgroundColor: primary, ...exact }}
            >
              {brandName.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold uppercase leading-tight tracking-tight sm:text-2xl" style={{ color: primary }}>
              {brandName}
            </h1>
            <div className="mt-0.5 text-[11px] leading-snug text-neutral-600">
              {(addressLines && addressLines.length > 0
                ? addressLines
                : ["Employee Savings Co-operative"]
              ).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              {contact && <p>{contact}</p>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold uppercase tracking-tight text-neutral-700 sm:text-lg">
            Savings Account Statement
          </p>
          <p className="text-xs text-neutral-500">Page : 1 of 1</p>
        </div>
      </header>

      {/* ── Holder + period/account box ──────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
        <div className="text-[13px] leading-relaxed">
          <p className="font-semibold uppercase">{holder.full_name ?? "—"}</p>
          {holder.job_title && <p className="text-neutral-600">{holder.job_title}</p>}
          {holder.department && <p className="text-neutral-600">{holder.department}</p>}
          {holder.email && <p className="text-neutral-600">{holder.email}</p>}
        </div>

        <table className="border-collapse text-[12px]" style={exact}>
          <thead>
            <tr>
              <th className="border px-4 py-1.5 font-semibold" style={headerCell}>
                Statement period
              </th>
              <th className="border px-4 py-1.5 font-semibold" style={headerCell}>
                Account No.
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border px-4 py-1.5 text-center tabular-nums">
                {fmtDate(statement.from)} to {fmtDate(statement.to)}
              </td>
              <td className="border px-4 py-1.5 text-center font-medium tabular-nums">{acctNo}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Transactions ─────────────────────────────────────────── */}
      <table className="mt-6 w-full table-fixed border-collapse text-[11px] sm:text-[12px]" style={exact}>
        <colgroup>
          <col style={{ width: "13%" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "17%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className="border px-2 py-2 text-left font-semibold sm:px-3" style={headerCell}>Date</th>
            <th className="border px-2 py-2 text-left font-semibold sm:px-3" style={headerCell}>Description</th>
            <th className="border px-2 py-2 text-left font-semibold sm:px-3" style={headerCell}>Ref.</th>
            <th className="border px-2 py-2 text-right font-semibold sm:px-3" style={headerCell}>Withdrawals<span className="font-normal opacity-80"> (XAF)</span></th>
            <th className="border px-2 py-2 text-right font-semibold sm:px-3" style={headerCell}>Deposits<span className="font-normal opacity-80"> (XAF)</span></th>
            <th className="border px-2 py-2 text-right font-semibold sm:px-3" style={headerCell}>Balance<span className="font-normal opacity-80"> (XAF)</span></th>
          </tr>
        </thead>
        <tbody>
          {/* Opening balance */}
          <tr style={zebra}>
            <td className="whitespace-nowrap border px-2 py-1.5 tabular-nums text-neutral-600 sm:px-3">{fmtDate(statement.from)}</td>
            <td className="border px-2 py-1.5 sm:px-3">Previous balance</td>
            <td className="border px-2 py-1.5 sm:px-3" />
            <td className="border px-2 py-1.5 sm:px-3" />
            <td className="border px-2 py-1.5 sm:px-3" />
            <td className="whitespace-nowrap border px-2 py-1.5 text-right tabular-nums sm:px-3">{amt(statement.openingBalance)}</td>
          </tr>

          {statement.transactions.length === 0 ? (
            <tr>
              <td colSpan={6} className="border px-3 py-8 text-center text-neutral-400">
                No transactions in this period.
              </td>
            </tr>
          ) : (
            renderRows(statement, zebra)
          )}

          {/* Totals */}
          <tr className="font-semibold" style={exact}>
            <td className="border px-2 py-2 sm:px-3" />
            <td className="border px-2 py-2 text-center tracking-wide text-neutral-600 sm:px-3">*** Totals ***</td>
            <td className="border px-2 py-2 sm:px-3" />
            <td className="whitespace-nowrap border px-2 py-2 text-right tabular-nums sm:px-3">{amt(statement.totalOut)}</td>
            <td className="whitespace-nowrap border px-2 py-2 text-right tabular-nums sm:px-3">{amt(statement.totalIn)}</td>
            <td className="border px-2 py-2 text-right tabular-nums sm:px-3" />
          </tr>
          {/* Closing balance */}
          <tr className="font-bold" style={{ ...zebra }}>
            <td className="border px-2 py-2 sm:px-3" />
            <td className="border px-2 py-2 sm:px-3" colSpan={4}>
              Closing balance
            </td>
            <td className="whitespace-nowrap border px-2 py-2 text-right tabular-nums sm:px-3" style={{ color: primary }}>
              {amt(statement.closingBalance)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Stamp + footer ───────────────────────────────────────── */}
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="max-w-md space-y-2">
          <p className="text-[10.5px] leading-snug text-neutral-500">
            All amounts shown in XAF (Central African CFA franc). Withdrawals are debits; deposits are
            credits. This is a system-generated statement and is valid without a handwritten signature.
          </p>
          {verifyCode && (
            <div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 text-[10.5px] leading-snug">
              {verifyQr && (
                <div
                  className="h-16 w-16 shrink-0"
                  aria-label="Verification QR code"
                  dangerouslySetInnerHTML={{ __html: verifyQr }}
                />
              )}
              <div>
                <p className="font-semibold text-neutral-700">Verification code</p>
                <p className="font-mono text-[12px] tracking-wider text-neutral-900">{verifyCode}</p>
                <p className="text-neutral-500">Scan the code or visit /verify/statement to confirm this statement is genuine.</p>
              </div>
            </div>
          )}
        </div>
        <MedallionStamp
          color={primary}
          topText={brandName}
          bottomText="Official Statement"
          centerText="Verified"
          subText={isoDate(generatedAt)}
          size={124}
          className="-rotate-12 shrink-0"
        />
      </div>

      <footer className="mt-3 flex items-center justify-between border-t pt-2 text-[10.5px] text-neutral-500">
        <span>
          Statement generated {isoDate(generatedAt)} for {holder.full_name ?? "member"}
          {holder.emp_num ? ` (Emp #${holder.emp_num})` : ""}.
        </span>
        <span className="whitespace-nowrap">
          Powered by <span className="font-semibold text-neutral-700">{SOFTWARE_NAME}</span>
        </span>
      </footer>
    </article>
  );
}

/** Render each transaction with a running balance, zebra-striped like a bank ledger. */
function renderRows(statement: Statement, zebra: React.CSSProperties) {
  let running = statement.openingBalance;
  return statement.transactions.map((t: SavingsTxn, i: number) => {
    const isIn = t.kind !== "withdrawal";
    running += isIn ? t.amount : -t.amount;
    const date = (t.period ?? t.created_at).slice(0, 10);
    const ref = t.id.replace(/[^0-9a-f]/gi, "").slice(0, 4).toUpperCase();
    const fallbackDesc =
      t.kind === "interest" ? "Interest" : t.kind === "contribution" ? "Contribution" : "Withdrawal";
    // Opening row was index 0, so transactions start striped on the off-beat.
    const striped = i % 2 === 1;
    return (
      <tr key={t.id} style={striped ? zebra : undefined}>
        <td className="whitespace-nowrap border px-2 py-1.5 tabular-nums text-neutral-600 sm:px-3">{date}</td>
        <td className="border px-2 py-1.5 sm:px-3">{t.note ?? fallbackDesc}</td>
        <td className="truncate border px-2 py-1.5 tabular-nums text-neutral-500 sm:px-3">{ref}</td>
        <td className="whitespace-nowrap border px-2 py-1.5 text-right tabular-nums text-red-700 sm:px-3">{isIn ? "" : amt(t.amount)}</td>
        <td className="whitespace-nowrap border px-2 py-1.5 text-right tabular-nums text-green-700 sm:px-3">{isIn ? amt(t.amount) : ""}</td>
        <td className="whitespace-nowrap border px-2 py-1.5 text-right tabular-nums font-medium sm:px-3">{amt(running)}</td>
      </tr>
    );
  });
}
