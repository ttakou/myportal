"use client";

import { useRef, useState, useTransition, type ComponentType } from "react";
import {
  Camera,
  Check,
  Flame,
  HeartPulse,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinOff,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  INCIDENT_LABEL,
  SAFETY_INSTRUCTIONS,
  type IncidentType,
} from "@/types/emergency";
import { attachIncidentLocation, reportIncident } from "../actions";

const HOLD_MS = 3000;

const TILES: { type: IncidentType; Icon: ComponentType<{ className?: string }> }[] = [
  { type: "medical", Icon: HeartPulse },
  { type: "fire", Icon: Flame },
  { type: "facility", Icon: TriangleAlert },
  { type: "active_threat", Icon: ShieldAlert },
];

type Coords = { lat: number; lng: number } | null;

/** Where the alert's location currently stands, for the confirmation screen. */
type LocState = "idle" | "locating" | "ok" | "unavailable";

/** Best-effort geolocation; resolves null if denied/unavailable within `timeout`. */
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

export function SosPanel() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<IncidentType | null>(null);
  const [sentCoords, setSentCoords] = useState<Coords>(null);

  // Location enrichment that runs *after* the alert has already been sent.
  const [sentIncidentId, setSentIncidentId] = useState<string | null>(null);
  const [locState, setLocState] = useState<LocState>("idle");
  const [manualLoc, setManualLoc] = useState("");
  const [savingLoc, setSavingLoc] = useState(false);

  // Category report dialog state
  const [dialog, setDialog] = useState<IncidentType | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  // Press-and-hold state for the SOS hero button
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);

  function clearHold() {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setProgress(0);
  }

  function startHold() {
    if (pending) return;
    fired.current = false;
    const start = Date.now();
    holdTimer.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / HOLD_MS) * 100);
      setProgress(pct);
      if (pct >= 100 && !fired.current) {
        fired.current = true;
        clearHold();
        void fireSos();
      }
    }, 50);
  }

  async function uploadPhoto(file: File): Promise<string | null> {
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("eess-media").upload(path, file);
      if (upErr) return null;
      return supabase.storage.from("eess-media").getPublicUrl(path).data.publicUrl;
    } catch {
      return null;
    }
  }

  /**
   * Capture GPS in the background and attach it to an already-sent incident.
   * The alert never waits on this — a slow or blocked GPS just shows the manual
   * fallback on the confirmation screen instead.
   */
  async function captureLocation(incidentId: string) {
    setLocState("locating");
    const coords = await getLocation();
    if (coords) {
      setSentCoords(coords);
      setLocState("ok");
      await attachIncidentLocation({ incidentId, lat: coords.lat, lng: coords.lng });
    } else {
      setLocState("unavailable");
    }
  }

  function retryLocation() {
    if (sentIncidentId) void captureLocation(sentIncidentId);
  }

  async function saveManualLocation() {
    if (!sentIncidentId || !manualLoc.trim()) return;
    setSavingLoc(true);
    const res = await attachIncidentLocation({
      incidentId: sentIncidentId,
      locationText: manualLoc.trim(),
    });
    setSavingLoc(false);
    if (res.ok) setLocState("ok");
    else setError(res.error ?? "Could not save location.");
  }

  function fireSos() {
    setError(null);
    startTransition(async () => {
      // Send the alert immediately — location is enriched afterwards.
      const res = await reportIncident({ incidentType: "other", isSos: true });
      if (!res.ok || !res.incidentId) {
        setError(res.error ?? "Could not send SOS.");
        return;
      }
      setSentIncidentId(res.incidentId);
      setSent("other");
      void captureLocation(res.incidentId);
    });
  }

  function submitCategory() {
    if (!dialog) return;
    const type = dialog;
    setError(null);
    startTransition(async () => {
      const photoUrl = photo ? await uploadPhoto(photo) : null;
      const res = await reportIncident({ incidentType: type, isSos: true, note, photoUrl });
      if (!res.ok || !res.incidentId) {
        setError(res.error ?? "Could not send report.");
        return;
      }
      setSentIncidentId(res.incidentId);
      setSent(type);
      setDialog(null);
      setNote("");
      setPhoto(null);
      void captureLocation(res.incidentId);
    });
  }

  // ---- Confirmation screen --------------------------------------------------
  if (sent) {
    return (
      <div className="rounded-xl border-2 border-green-500/40 bg-green-50 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white">
          <Check className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-green-800">
          {INCIDENT_LABEL[sent]} alert sent
        </h2>
        <p className="mt-1 text-sm text-green-700">
          The safety team has been notified
          {locState === "ok" && sentCoords ? " with your location" : ""}.
        </p>
        <ul className="mx-auto mt-4 max-w-sm space-y-2 text-left">
          {SAFETY_INSTRUCTIONS[sent].map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-green-900">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ul>

        {/* Location status — captured automatically, with a manual fallback. */}
        <div className="mx-auto mt-5 max-w-sm">
          {locState === "locating" && (
            <p className="inline-flex items-center gap-2 text-xs text-green-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pinpointing your location…
            </p>
          )}
          {locState === "ok" && sentCoords && (
            <p className="inline-flex items-center gap-1 text-xs text-green-700">
              <MapPin className="h-3.5 w-3.5" />
              {sentCoords.lat.toFixed(5)}, {sentCoords.lng.toFixed(5)}
            </p>
          )}
          {locState === "ok" && !sentCoords && (
            <p className="inline-flex items-center gap-1 text-xs text-green-700">
              <MapPin className="h-3.5 w-3.5" />
              Location shared with the response team.
            </p>
          )}
          {locState === "unavailable" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-left">
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
                <MapPinOff className="h-4 w-4" />
                We couldn&apos;t access your location
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Enable location to share it automatically, or describe where you are.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={manualLoc}
                  onChange={(e) => setManualLoc(e.target.value)}
                  placeholder="e.g. Block C, 2nd floor, near lab"
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                />
                <Button size="sm" disabled={savingLoc || !manualLoc.trim()} onClick={saveManualLocation}>
                  {savingLoc ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                </Button>
              </div>
              <button
                type="button"
                onClick={retryLocation}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline"
              >
                <LocateFixed className="h-3.5 w-3.5" /> Enable location & retry
              </button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <Button
            variant="outline"
            onClick={() => {
              setSent(null);
              setSentCoords(null);
              setSentIncidentId(null);
              setLocState("idle");
              setManualLoc("");
            }}
          >
            Back to safety home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Hero SOS button — press & hold for 3 seconds */}
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6">
        <button
          type="button"
          disabled={pending}
          onPointerDown={startHold}
          onPointerUp={clearHold}
          onPointerLeave={clearHold}
          onPointerCancel={clearHold}
          className={cn(
            "relative flex h-44 w-44 select-none items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
            "bg-destructive disabled:opacity-70",
          )}
          style={{
            backgroundImage: progress
              ? `conic-gradient(rgba(255,255,255,0.45) ${progress}%, transparent ${progress}%)`
              : undefined,
          }}
          aria-label="Hold for 3 seconds to send an SOS"
        >
          <span className="flex flex-col items-center">
            {pending ? (
              <Loader2 className="h-12 w-12 animate-spin" />
            ) : (
              <Siren className="h-12 w-12" />
            )}
            <span className="mt-1 text-2xl font-bold tracking-wide">SOS</span>
          </span>
        </button>
        <p className="text-sm text-muted-foreground">
          {pending ? "Sending…" : "Press and hold for 3 seconds to alert the response team"}
        </p>
      </div>

      {/* Quick category grid */}
      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Report a specific threat</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TILES.map(({ type, Icon }) => (
            <button
              key={type}
              type="button"
              disabled={pending}
              onClick={() => { setError(null); setDialog(type); }}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:border-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              <Icon className="h-7 w-7 text-destructive" />
              <span className="text-sm font-medium leading-tight">{INCIDENT_LABEL[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Category confirm dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold">{INCIDENT_LABEL[dialog]}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add details if you safely can, then send. Your location is attached automatically.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What's happening? (optional)"
              className="mt-3 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Camera className="h-4 w-4" />
              <span>{photo ? photo.name : "Attach a photo (optional)"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" disabled={pending} onClick={() => { setDialog(null); setNote(""); setPhoto(null); }}>
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" disabled={pending} onClick={submitCategory}>
                {pending ? "Sending…" : "Send alert"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
