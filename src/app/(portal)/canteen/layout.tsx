import { getAccess } from "@/lib/auth";
import { CanteenTabs } from "./_components/canteen-tabs";
import { canteenAccessOf } from "./_components/canteen-views";

/**
 * Every /canteen/* page gets the consolidated hub tab bar at the top. The bar
 * self-hides outside a multi-route hub, so single pages look unchanged.
 */
export default async function CanteenLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess();
  return (
    <div className="space-y-4">
      <CanteenTabs access={canteenAccessOf(access)} />
      {children}
    </div>
  );
}
