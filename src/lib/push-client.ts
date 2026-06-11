"use client";

import { savePushSubscription, removePushSubscription } from "@/app/(portal)/emergency/push-actions";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushState =
  | "unsupported" // browser can't do push
  | "unconfigured" // server has no VAPID key
  | "denied" // user blocked notifications
  | "subscribed"
  | "unsubscribed";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function ready(): Promise<ServiceWorkerRegistration> {
  // Registration is kicked off elsewhere; wait for it to become active.
  await navigator.serviceWorker.register("/sw.js").catch(() => {});
  return navigator.serviceWorker.ready;
}

/** Current push state for this device. */
export async function getPushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

function toRecord(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
}

/** Opt this device in: request permission, subscribe, persist server-side. */
export async function subscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (!supported()) return { ok: false, error: "Push isn't supported on this device." };
  if (!VAPID_PUBLIC_KEY) return { ok: false, error: "Push isn't configured yet." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notifications were not allowed." };
  }

  const reg = await ready();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key.buffer.slice(
        key.byteOffset,
        key.byteOffset + key.byteLength,
      ) as ArrayBuffer,
    });
  }
  return savePushSubscription(toRecord(sub));
}

/** Opt this device out: drop the browser subscription and the server record. */
export async function unsubscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (!supported()) return { ok: true };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  return removePushSubscription(endpoint);
}
