/**
 * Minimal, dependency-free Web Push sender.
 *
 * Implements the two RFCs the browser push services require:
 *   - RFC 8292 (VAPID)  — an ES256-signed JWT identifying this application
 *     server, so the push service accepts the request.
 *   - RFC 8291 (aes128gcm) — payload encryption bound to the subscription's
 *     public key + auth secret, so only the recipient's browser can read it.
 *
 * Everything is done with the Web Crypto API (globalThis.crypto.subtle), which
 * is available in the Node.js runtime used by Next.js server actions. This
 * avoids pulling in the `web-push` npm package (and any native deps).
 *
 * Configure via env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — base64url, 65-byte uncompressed P-256 point
 *   VAPID_PRIVATE_KEY             — base64url, 32-byte P-256 private scalar
 *   VAPID_SUBJECT                 — "mailto:safety@example.com" or an https URL
 */

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string; // base64url, 65-byte uncompressed point
  auth: string; // base64url, 16-byte secret
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  severity?: "info" | "warning" | "critical";
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

// --- base64url helpers -------------------------------------------------------
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Copy bytes into a plain ArrayBuffer. Web Crypto / fetch expect a
 * `BufferSource` backed by ArrayBuffer (not the ArrayBufferLike that typed
 * arrays now carry by default), so this keeps every boundary type-clean.
 */
function ab(u: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u.byteLength);
  new Uint8Array(buf).set(u);
  return buf;
}

async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await subtle.importKey(
    "raw",
    ab(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await subtle.sign("HMAC", key, ab(data)));
}

// --- VAPID (RFC 8292) --------------------------------------------------------
const vapidJwtCache = new Map<string, { jwt: string; exp: number }>();

async function vapidAuthHeader(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const now = Math.floor(Date.now() / 1000);

  const cached = vapidJwtCache.get(audience);
  if (cached && cached.exp - now > 300) {
    return `vapid t=${cached.jwt}, k=${publicKey}`;
  }

  const exp = now + 12 * 60 * 60; // 12h, the spec's maximum
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(JSON.stringify({ aud: audience, exp, sub: process.env.VAPID_SUBJECT })),
  );
  const signingInput = `${header}.${payload}`;

  // Reconstruct a JWK from the raw public point + private scalar to import for signing.
  const pub = b64urlToBytes(publicKey); // 0x04 || X(32) || Y(32)
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: process.env.VAPID_PRIVATE_KEY!,
    ext: true,
  };
  const key = await subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // Web Crypto returns the raw r||s (IEEE P1363) signature ES256/JOSE expects.
  const sig = new Uint8Array(
    await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, ab(enc.encode(signingInput))),
  );
  const jwt = `${signingInput}.${bytesToB64url(sig)}`;
  vapidJwtCache.set(audience, { jwt, exp });
  return `vapid t=${jwt}, k=${publicKey}`;
}

// --- Payload encryption (RFC 8291, aes128gcm) --------------------------------
async function encryptPayload(
  sub: PushSubscriptionRecord,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(sub.auth); // 16 bytes
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));

  // Ephemeral application-server ECDH keypair.
  const asKeys = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublic = new Uint8Array(await subtle.exportKey("raw", asKeys.publicKey)); // 65 bytes

  const uaKey = await subtle.importKey(
    "raw",
    ab(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256),
  );

  // Combine ECDH + auth secret, then derive CEK and nonce (RFC 8291 §3.4).
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode("WebPush: info"), Uint8Array.of(0), uaPublic, asPublic);
  const ikm = (await hmac(prkKey, concat(keyInfo, Uint8Array.of(1)))).slice(0, 32);

  const prk = await hmac(salt, ikm);
  const cekInfo = concat(enc.encode("Content-Encoding: aes128gcm"), Uint8Array.of(0));
  const cek = (await hmac(prk, concat(cekInfo, Uint8Array.of(1)))).slice(0, 16);
  const nonceInfo = concat(enc.encode("Content-Encoding: nonce"), Uint8Array.of(0));
  const nonce = (await hmac(prk, concat(nonceInfo, Uint8Array.of(1)))).slice(0, 12);

  // Single record: plaintext followed by the 0x02 record-delimiter padding byte.
  const record = concat(plaintext, Uint8Array.of(2));
  const aesKey = await subtle.importKey("raw", ab(cek), { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: ab(nonce), tagLength: 128 }, aesKey, ab(record)),
  );

  // aes128gcm header: salt(16) || rs(4, BE) || idlen(1) || keyid(as_public 65).
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concat(header, ciphertext);
}

/**
 * Encrypt and POST a single notification. Returns the push service's HTTP
 * status code (201/200/204 = accepted; 404/410 = subscription gone). Throws
 * only on a network-level failure.
 */
export async function sendWebPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<number> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: payload.severity === "critical" ? "high" : "normal",
      Authorization: await vapidAuthHeader(sub.endpoint),
    },
    body: ab(body),
  });
  return res.status;
}
