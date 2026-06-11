import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getReservations, today } from "@/lib/canteen";
import { ServingScreen } from "./serving-screen";

export default async function ServingPage() {
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

  const date = today();
  const reservations = await getReservations(date);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/canteen" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Canteen
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Serving point</h1>
        <p className="text-muted-foreground">Validate and collect meals · {date}</p>
      </div>
      <ServingScreen reservations={reservations} />
    </div>
  );
}
