import "server-only";

import type { FlightStatus } from "@/types/trips";

/**
 * Live flight lookup via AviationStack (https://aviationstack.com).
 * Configure FLIGHT_API_KEY in the environment; without it, lookups return a
 * friendly error and the travel desk keeps updating flight status manually.
 */

export interface FlightInfo {
  status: FlightStatus;
  airline: string | null;
  terminal: string | null;
  /** Best arrival estimate: actual > estimated > scheduled. */
  arrivalAt: string | null;
  /** Arrival delay in minutes, when the API reports one. */
  delayMinutes: number | null;
}

type LookupResult = { ok: true; info: FlightInfo } | { ok: false; error: string };

function mapStatus(apiStatus: string | null, delay: number | null): FlightStatus {
  switch (apiStatus) {
    case "landed":
      return "landed";
    case "cancelled":
      return "cancelled";
    case "incident":
    case "diverted":
      return "diverted";
    case "scheduled":
    case "active":
    default:
      return delay && delay > 0 ? "delayed" : "scheduled";
  }
}

export async function lookupFlight(flightNumber: string): Promise<LookupResult> {
  const key = process.env.FLIGHT_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: "Flight tracking is not configured (set FLIGHT_API_KEY). Update the status manually.",
    };
  }
  const iata = flightNumber.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(iata)) {
    return { ok: false, error: `"${flightNumber}" does not look like a flight number (e.g. ET925).` };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${iata}&limit=1`,
      { cache: "no-store" },
    );
  } catch {
    return { ok: false, error: "Could not reach the flight-data service. Try again shortly." };
  }
  if (!res.ok) {
    return { ok: false, error: `Flight-data service error (HTTP ${res.status}).` };
  }

  const body = (await res.json()) as {
    error?: { message?: string };
    data?: Array<{
      flight_status: string | null;
      airline?: { name?: string | null };
      arrival?: {
        terminal?: string | null;
        delay?: number | null;
        scheduled?: string | null;
        estimated?: string | null;
        actual?: string | null;
      };
    }>;
  };
  if (body.error) {
    return { ok: false, error: body.error.message ?? "Flight-data service rejected the request." };
  }
  const flight = body.data?.[0];
  if (!flight) {
    return { ok: false, error: `No live data found for flight ${iata}.` };
  }

  const arr = flight.arrival ?? {};
  const delay = arr.delay ?? null;
  return {
    ok: true,
    info: {
      status: mapStatus(flight.flight_status, delay),
      airline: flight.airline?.name ?? null,
      terminal: arr.terminal ?? null,
      arrivalAt: arr.actual ?? arr.estimated ?? arr.scheduled ?? null,
      delayMinutes: delay,
    },
  };
}
