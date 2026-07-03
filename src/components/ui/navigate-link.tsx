import { Navigation } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Turn-by-turn directions deep link for an incident/location. Uses the Google
 * Maps universal directions URL: with no origin specified, Maps (app or web)
 * starts from the device's current position — so a responder gets guided
 * navigation with one tap and we never need our own geolocation permission.
 * Coordinates win over free-text (unambiguous); returns null with neither.
 */
export function directionsUrl(dest: {
  lat?: number | null;
  lng?: number | null;
  text?: string | null;
}): string | null {
  if (dest.lat != null && dest.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`;
  }
  const t = dest.text?.trim();
  if (t) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t)}`;
  return null;
}

/** "Navigate" chip that opens directions to the given point in the maps app. */
export function NavigateLink({
  lat,
  lng,
  text,
  label = "Navigate",
  className,
}: {
  lat?: number | null;
  lng?: number | null;
  text?: string | null;
  label?: string;
  className?: string;
}) {
  const url = directionsUrl({ lat, lng, text });
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open turn-by-turn directions from your current position"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10",
        className,
      )}
    >
      <Navigation className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
