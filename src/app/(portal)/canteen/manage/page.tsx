import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getKitchens,
  getManagedDishes,
  getServedMealPeriods,
  resolveServiceDate,
} from "@/lib/canteen";
import { MenuEditor } from "./_components/menu-editor";

export default async function ManageMenuPage(
  props: {
    searchParams: Promise<{ date?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  if (!(await getAccess()).isCanteenManager) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <Link href="/canteen" className="text-sm font-medium text-primary hover:underline">
          ← Back to the canteen
        </Link>
      </div>
    );
  }

  const serviceDate = resolveServiceDate(searchParams.date);
  const [kitchens, dishes, mealPeriods] = await Promise.all([
    getKitchens(),
    getManagedDishes(serviceDate),
    getServedMealPeriods(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/canteen"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Canteen
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Manage menu</h1>
        <p className="text-muted-foreground">Publish dishes for {serviceDate}.</p>
      </div>

      <MenuEditor
        serviceDate={serviceDate}
        kitchens={kitchens}
        dishes={dishes}
        mealPeriods={mealPeriods}
      />
    </div>
  );
}
