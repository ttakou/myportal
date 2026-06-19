"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStatusTransition } from "@/components/activity";
import {
  CheckCircle2,
  Circle,
  Loader2,
  LocateFixed,
  MapPin,
  MessageSquarePlus,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  INCIDENT_LABEL,
  STATUS_LABEL,
  type Incident,
  type IncidentStatus,
  type IncidentUpdate,
} from "@/types/emergency";
import { addIncidentUpdate } from "../actions";

const STATUS_BADGE: Record<IncidentStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  acknowledged: "bg-sky-100 text-sky-800",
  responding: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-700",
};

type Coords = { lat: number; lng: number } | null;

function getLocation(timeout = 10000): Promise<Coords> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    );
  });
}

function when(ts: string): string {
  return new Date(ts).toLocaleString();
}

function updateLabel(u: IncidentUpdate): string {
  switch (u.kind) {
    case "created":
      return "Reported";
    case "status":
      return u.status ? STATUS_LABEL[u.status] : "Status updated";
    case "location":
      return "Location updated";
    default:
      return "Update";
  }
}

export function IncidentTracker({
  incidents,
  updatesByIncident,
}: {
  incidents: Incident[];
  updatesByIncident: Record<string, IncidentUpdate[]>;
}) {
  if (incidents.length === 0) {
    return <p className="text-sm text-muted-foreground">You haven&apos;t raised any alerts.</p>;
  }
  return (
    <div className="space-y-3">
      {incidents.map((incident) => (
        <IncidentCard
          key={incident.id}
          incident={incident}
          updates={updatesByIncident[incident.id] ?? []}
        />
      ))}
    </div>
  );
}

function IncidentCard({ incident, updates }: { incident: Incident; updates: IncidentUpdate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Sending update…");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sharing, setSharing] = useState(false);
  const [coords, setCoords] = useState<Coords>(null);
  const [error, setError] = useState<string | null>(null);

  const isResolved = incident.status === "resolved";

  async function shareLocation() {
    setSharing(true);
    setError(null);
    const c = await getLocation();
    setSharing(false);
    if (c) setCoords(c);
    else setError("Couldn't access your location. You can still send a note.");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addIncidentUpdate({
        incidentId: incident.id,
        body: note,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not send update.");
        return;
      }
      setNote("");
      setCoords(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{INCIDENT_LABEL[incident.incident_type]}</span>
          {incident.is_sos && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              SOS
            </span>
          )}
          <span className="text-muted-foreground">{when(incident.created_at)}</span>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_BADGE[incident.status],
          )}
        >
          {STATUS_LABEL[incident.status]}
        </span>
      </div>

      {/* Timeline */}
      <ol className="space-y-0 p-3">
        {updates.map((u, i) => {
          const last = i === updates.length - 1;
          const done = u.kind === "status" && u.status === "resolved";
          return (
            <li key={u.id} className="relative flex gap-3 pb-3 last:pb-0">
              {/* rail */}
              {!last && <span className="absolute left-[7px] top-4 h-full w-px bg-border" />}
              <span className="mt-0.5 shrink-0">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{updateLabel(u)}</span>
                  <span className="text-xs text-muted-foreground">{when(u.created_at)}</span>
                  {u.author_name && (
                    <span className="text-xs text-muted-foreground">· {u.author_name}</span>
                  )}
                </div>
                {u.body && <p className="mt-0.5 text-sm text-muted-foreground">{u.body}</p>}
                {u.lat != null && u.lng != null && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {u.lat.toFixed(5)}, {u.lng.toFixed(5)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Update affordance */}
      {isResolved ? (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          This incident has been resolved.
        </p>
      ) : !open ? (
        <div className="border-t p-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <MessageSquarePlus className="h-4 w-4" /> Add an update
          </button>
        </div>
      ) : (
        <div className="space-y-2 border-t p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add new information for the response team…"
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sharing || pending}
              onClick={shareLocation}
            >
              {sharing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {coords ? "Location attached" : "Share my location"}
            </Button>
            {coords && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setNote("");
                  setCoords(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || (!note.trim() && !coords)}
                onClick={submit}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
