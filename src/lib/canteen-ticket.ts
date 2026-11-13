/**
 * The meal ticket: what a booked meal shows at the counter.
 *
 * The QR code carries the booking id and nothing else. The serving screen
 * matches a scan against the day's bookings, so a ticket only works on its
 * own date, and a booking already collected is refused there. Pure, so the
 * states are tested.
 */

export type TicketState =
  /** Booked for today and not yet handed over: show it at the counter. */
  | "valid"
  /** Already handed over: the ticket is used. */
  | "collected"
  /** For a later day: it will work on that day. */
  | "upcoming"
  /** For an earlier day and never collected. */
  | "expired";

export function ticketState(
  booking: { service_date: string; collected_at: string | null },
  today: string,
): TicketState {
  if (booking.collected_at) return "collected";
  if (booking.service_date > today) return "upcoming";
  if (booking.service_date < today) return "expired";
  return "valid";
}

/** What goes in the QR code: the booking id, which the serving screen matches. */
export function ticketCode(bookingId: string): string {
  return bookingId;
}

/** Plates the ticket covers: the person plus their visitors. */
export function ticketPlates(guestCount: number): number {
  return 1 + Math.max(0, Number(guestCount) || 0);
}
