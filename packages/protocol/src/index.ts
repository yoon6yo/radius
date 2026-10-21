export const MAX_NAME_LENGTH = 32;
export const MAX_SIGNAL_BYTES = 16 * 1024;
/** Prefix of the bytes a device signs to prove key ownership: AUTH_CONTEXT + nonce. */
export const AUTH_CONTEXT = "radius-auth-v1:";

export interface PeerInfo {
  id: string;
  name: string;
}

export type ClientMsg =
  | { t: "hello"; pub: string; name: string }
  | { t: "auth"; sig: string }
  | { t: "rename"; name: string }
  | { t: "signal"; to: string; data: unknown };

export type ServerMsg =
  | { t: "challenge"; nonce: string }
  | { t: "ready"; id: string; peers: PeerInfo[] }
  | { t: "peer"; peer: PeerInfo }
  | { t: "left"; id: string }
  | { t: "signal"; from: string; data: unknown }
  | { t: "error"; code: ErrorCode };

export type ErrorCode = "bad_message" | "auth_failed" | "room_full" | "unknown_peer" | "too_large";

const B64URL = /^[A-Za-z0-9_-]+$/;
const DEVICE_ID = /^[0-9a-f]{64}$/;

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array | null {
  if (!B64URL.test(s)) return null;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  try {
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function sanitizeName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isB64(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max && B64URL.test(v);
}

export function isDeviceId(v: unknown): v is string {
  return typeof v === "string" && DEVICE_ID.test(v);
}

export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (!isRecord(raw)) return null;
  switch (raw.t) {
    case "hello": {
      if (!isB64(raw.pub, 200) || typeof raw.name !== "string") return null;
      const name = sanitizeName(raw.name);
      return name ? { t: "hello", pub: raw.pub, name } : null;
    }
    case "auth":
      return isB64(raw.sig, 200) ? { t: "auth", sig: raw.sig } : null;
    case "rename": {
      if (typeof raw.name !== "string") return null;
      const name = sanitizeName(raw.name);
      return name ? { t: "rename", name } : null;
    }
    case "signal":
      return isDeviceId(raw.to) && raw.data !== undefined ? { t: "signal", to: raw.to, data: raw.data } : null;
    default:
      return null;
  }
}

export function parseServerMsg(raw: unknown): ServerMsg | null {
  if (!isRecord(raw)) return null;
  const peer = (v: unknown): PeerInfo | null =>
    isRecord(v) && isDeviceId(v.id) && typeof v.name === "string" ? { id: v.id, name: v.name } : null;
  switch (raw.t) {
    case "challenge":
      return isB64(raw.nonce, 200) ? { t: "challenge", nonce: raw.nonce } : null;
    case "ready": {
      if (!isDeviceId(raw.id) || !Array.isArray(raw.peers)) return null;
      const peers = raw.peers.map(peer);
      return peers.every((p) => p !== null) ? { t: "ready", id: raw.id, peers: peers as PeerInfo[] } : null;
    }
    case "peer": {
      const p = peer(raw.peer);
      return p ? { t: "peer", peer: p } : null;
    }
    case "left":
      return isDeviceId(raw.id) ? { t: "left", id: raw.id } : null;
    case "signal":
      return isDeviceId(raw.from) && raw.data !== undefined ? { t: "signal", from: raw.from, data: raw.data } : null;
    case "error":
      return typeof raw.code === "string" ? { t: "error", code: raw.code as ErrorCode } : null;
    default:
      return null;
  }
}
