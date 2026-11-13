"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Read a QR code with the device camera — the canteen tablet or a phone — so
 * the counter needs no scanner hardware. Uses the browser's own QR detector
 * where it has one and the jsQR decoder elsewhere (iPhones and iPads), loaded
 * only when the camera opens. Calls `onResult` once, with the code's text.
 */
export function CameraScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest callback, so a re-render does not restart the camera.
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    let busy = false;

    const stop = () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot use the camera here. Use the scan box instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setError("The camera could not be opened. Allow camera access for this site and try again.");
        return;
      }
      if (done) return stop();
      const video = videoRef.current;
      if (!video) return stop();
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      let detector: Detector | null = null;
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (Native) {
        try {
          detector = new Native({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;

      timer = setInterval(async () => {
        if (done || busy || !video.videoWidth) return;
        busy = true;
        try {
          let text: string | null = null;
          if (detector) {
            text = (await detector.detect(video))[0]?.rawValue ?? null;
          } else if (jsQR) {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d", { willReadFrequently: true });
            if (canvas && ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          }
          if (text && !done) {
            stop();
            resultRef.current(text);
          }
        } finally {
          busy = false;
        }
      }, 250);
    })();

    return stop;
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Scan a meal ticket">
      <div className="w-full max-w-md space-y-3 rounded-lg bg-card p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <p className="font-medium">Scan a meal ticket</p>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-md bg-black">
            <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/80" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <p className="text-xs text-muted-foreground">Hold the QR code on the person&apos;s ticket inside the frame.</p>
        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
