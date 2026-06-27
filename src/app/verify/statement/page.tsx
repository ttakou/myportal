import { BadgeCheck, ShieldX, Search } from "lucide-react";
import { getStatementByCode } from "@/lib/savings";

const money = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 });

/**
 * Public statement verification — no login required. Anyone holding a printed
 * savings statement can enter its code to confirm the issuer, member, period
 * and balances match what the system issued.
 */
export default async function VerifyStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const code = (await searchParams).code?.trim() ?? "";
  const record = code ? await getStatementByCode(code) : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Verify a savings statement</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the verification code printed on a savings account statement to confirm it is genuine.
      </p>

      <form method="get" className="mt-4 flex gap-2">
        <input
          name="code"
          defaultValue={code}
          placeholder="e.g. ADD-7F3A-2B91"
          className="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm uppercase tracking-wider"
        />
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Search className="h-4 w-4" /> Verify
        </button>
      </form>

      {code && !record && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">No statement matches this code.</p>
            <p className="text-sm text-muted-foreground">
              Check the code is exactly as printed. A mismatch may mean the document has been altered.
            </p>
          </div>
        </div>
      )}

      {record && (
        <div className="mt-6 space-y-3 rounded-lg border border-green-300 bg-green-50 p-5">
          <div className="flex items-center gap-2 text-green-700">
            <BadgeCheck className="h-6 w-6" />
            <p className="text-lg font-semibold">Genuine statement</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="Issued by" value={record.tenantName ?? "—"} />
            <Row label="Account holder" value={record.holderName ?? "—"} />
            <Row label="Statement period" value={`${record.from} → ${record.to}`} />
            <Row label="Opening balance" value={money(record.opening)} />
            <Row label="Closing balance" value={money(record.closing)} />
            <Row label="Issued on" value={new Date(record.generatedAt).toLocaleString()} />
            <Row label="Code" value={record.code} mono />
          </dl>
          <p className="text-xs text-green-700/80">
            These figures must match the printed statement exactly. If anything differs, the document
            has been altered.
          </p>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">Powered by MyEnterprisePortal</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono" : "font-medium"}>{value}</dd>
    </div>
  );
}
