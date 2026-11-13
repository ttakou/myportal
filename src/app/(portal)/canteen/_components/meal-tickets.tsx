import QRCode from "qrcode";
import { CheckCircle2, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { siteClock } from "@/lib/visitors/daily";
import { cn } from "@/lib/utils";
import { ticketCode, ticketPlates, ticketState, type TicketState } from "@/lib/canteen-ticket";
import { MEAL_PERIODS, MEAL_PERIOD_LABEL, type CanteenBooking, type CanteenDish } from "@/types/canteen";

const STATE_TEXT: Record<TicketState, string> = {
  valid: "Show this at the counter",
  collected: "Collected",
  upcoming: "Valid on the day of the meal",
  expired: "Not collected",
};

/**
 * The person's meal tickets for a day: one per booked meal, with a QR code the
 * canteen scans at the counter. Once the meal is handed over the ticket is
 * greyed out and its code hidden, so it cannot be shown again.
 */
export async function MealTickets({
  bookings,
  dishes,
  serviceDate,
  today,
  compact = false,
}: {
  bookings: CanteenBooking[];
  dishes: CanteenDish[];
  serviceDate: string;
  today: string;
  compact?: boolean;
}) {
  const live = bookings.filter((b) => b.status !== "cancelled");
  if (live.length === 0) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle()
    : { data: null };
  const name = (me?.full_name as string | null) ?? (me?.email as string | null) ?? "—";

  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const ordered = [...live].sort((a, b) => MEAL_PERIODS.indexOf(a.meal_period) - MEAL_PERIODS.indexOf(b.meal_period));
  const tickets = await Promise.all(
    ordered.map(async (b) => {
      const state = ticketState(b, today);
      const qr =
        state === "valid" || state === "upcoming"
          ? await QRCode.toString(ticketCode(b.id), { type: "svg", margin: 1, width: compact ? 120 : 168, errorCorrectionLevel: "M" }).catch(() => null)
          : null;
      return { b, state, qr, dish: dishById.get(b.dish_id) ?? null };
    }),
  );

  const prettyDate = new Date(serviceDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Ticket className="h-4 w-4 text-primary" /> My meal ticket{tickets.length > 1 ? "s" : ""}
      </h2>
      <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
        {tickets.map(({ b, state, qr, dish }) => {
          const used = state === "collected" || state === "expired";
          const plates = ticketPlates(b.guest_count);
          return (
            <div
              key={b.id}
              className={cn(
                "flex items-center gap-4 rounded-lg border-2 border-dashed bg-card p-4",
                state === "valid" && "border-primary/40",
                used && "opacity-60",
              )}
            >
              {qr ? (
                // Dark modules on white, whatever the theme, so scanners read it.
                <div
                  className="shrink-0 rounded-md bg-white p-1"
                  aria-label="Meal ticket QR code"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              ) : (
                <div className={cn("flex shrink-0 items-center justify-center rounded-md bg-muted", compact ? "h-[120px] w-[120px]" : "h-[168px] w-[168px]")}>
                  <CheckCircle2 className={cn("h-10 w-10", state === "collected" ? "text-green-600" : "text-muted-foreground")} />
                </div>
              )}
              <div className="min-w-0 space-y-1 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {MEAL_PERIOD_LABEL[b.meal_period]} · {prettyDate}
                </p>
                <p className="truncate text-base font-semibold">{name}</p>
                <p className="font-medium">
                  {dish?.name ?? "Booked meal"}
                  {dish?.kitchen_name ? <span className="font-normal text-muted-foreground"> · {dish.kitchen_name}</span> : null}
                </p>
                {b.selected_options.length > 0 && (
                  <p className="text-xs text-muted-foreground">{b.selected_options.map((o) => o.name).join(", ")}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {plates} plate{plates === 1 ? "" : "s"}
                  {b.guest_count > 0 ? ` (you + ${b.guest_count} visitor${b.guest_count === 1 ? "" : "s"})` : ""}
                </p>
                <p
                  className={cn(
                    "pt-1 text-xs font-semibold",
                    state === "valid" && "text-primary",
                    state === "collected" && "text-green-700",
                    state === "expired" && "text-amber-700",
                  )}
                >
                  {STATE_TEXT[state]}
                  {state === "collected" && b.collected_at ? ` at ${siteClock(b.collected_at)}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
