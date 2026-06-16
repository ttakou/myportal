import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { resolveServiceDate, today } from "@/lib/canteen";
import { getRedemptionBoard, isWorkingDay } from "@/lib/canteen-entitlements";
import { RedeemBoard } from "./_components/redeem-board";

export default async function RedeemPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  if (!(await getAccess()).isCanteenStaff) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Canteen staff only</h1>
        <Link href="/canteen" className="text-sm font-medium text-primary hover:underline">
          ← Back to the canteen
        </Link>
      </div>
    );
  }

  const serviceDate = resolveServiceDate(searchParams.date);
  const board = await getRedemptionBoard(serviceDate);
  const working = isWorkingDay(serviceDate);

  const prettyDate = new Date(serviceDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/canteen"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Canteen
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Meal entitlements — serving</h1>
          <p className="text-muted-foreground">{prettyDate}</p>
        </div>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={serviceDate === today() ? undefined : serviceDate}
            className="rounded-md border bg-background px-2 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Go
          </button>
        </form>
      </div>

      {!working && (
        <p className="rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800">
          This is not a working day (Mon–Fri), so no meals are entitled.
        </p>
      )}

      <RedeemBoard board={board} serviceDate={serviceDate} />
    </div>
  );
}
