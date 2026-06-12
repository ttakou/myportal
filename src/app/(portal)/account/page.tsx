import { getMyNotificationPrefs } from "@/lib/notification-prefs";
import { PushToggle } from "../emergency/_components/push-toggle";
import { NotificationPreferences } from "./_components/notification-preferences";

export default async function AccountPage() {
  const prefs = await getMyNotificationPrefs();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account &amp; notifications</h1>
        <p className="text-muted-foreground">Control how and where the portal reaches you.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">This device</h2>
        <PushToggle />
        <p className="text-xs text-muted-foreground">
          Push must be turned on per device. Use the preferences below to choose which kinds of
          notifications you receive.
        </p>
      </section>

      <NotificationPreferences initial={prefs} />
    </div>
  );
}
