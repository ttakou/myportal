"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStatusTransition } from "@/components/activity";
import { Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTransportRequest } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Request a ride. On its own view so the form is the whole screen, not a
 * strip above a list; a saved request lands the person on the requests
 * list where they can follow it.
 */
export function RequestForm() {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [purpose, setPurpose] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await createTransportRequest({
            pickup,
            dropoff,
            departAt,
            passengers: Number(passengers),
            purpose,
          });
          if (!res.ok) setError(res.error ?? "Could not save the request.");
          else router.push("/transportation?view=requests");
        });
      }}
      className="max-w-2xl space-y-4 rounded-lg border bg-card p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Request a transportation</h2>
        <p className="text-sm text-muted-foreground">
          Say where from, where to and when. The dispatcher assigns a driver and a vehicle; you will
          see who on the requests list.
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          Pickup location
          <input value={pickup} onChange={(e) => setPickup(e.target.value)} required className={`mt-1 block w-full ${field}`} placeholder="e.g. Base main gate" />
        </label>
        <label className="text-xs font-medium">
          Drop-off location
          <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} required className={`mt-1 block w-full ${field}`} placeholder="e.g. Douala airport" />
        </label>
        <label className="text-xs font-medium">
          Departure
          <input value={departAt} onChange={(e) => setDepartAt(e.target.value)} type="datetime-local" required className={`mt-1 block w-full ${field}`} />
        </label>
        <label className="text-xs font-medium">
          Passengers
          <input value={passengers} onChange={(e) => setPassengers(e.target.value)} type="number" min={1} className={`mt-1 block w-full ${field}`} />
        </label>
        <label className="text-xs font-medium sm:col-span-2">
          Purpose (optional)
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`mt-1 block w-full ${field}`} placeholder="Meeting, site visit, hospital run…" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          <Car className="h-4 w-4" /> {pending ? "Sending…" : "Send request"}
        </Button>
        <span className="text-xs text-muted-foreground">You can cancel it from the requests list until a driver has started.</span>
      </div>
    </form>
  );
}
